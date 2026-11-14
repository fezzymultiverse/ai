"""Run extracted production Java methods against real files and mocked Android APIs.
Requires Python 3, JDK 17+, and an org.json jar supplied as JSON_JAR (or downloaded
from Maven Central into a temporary directory). This is NOT an Android device test.
Run from project root: python3 tests/test_download_native.py
"""
from pathlib import Path
import os
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
web = (ROOT / 'native/FBWebPlugin.java').read_text()
dl = (ROOT / 'native/FBDownloader.java').read_text()

def method(source, signature):
    start = source.index(signature)
    opening = source.index('{', start)
    depth = 1
    i = opening + 1
    while depth:
        if source[i] == '{': depth += 1
        if source[i] == '}': depth -= 1
        i += 1
    return source[start:i]

assert 'call.getLong("id", -1L)' not in web
assert web.count('downloadId(call)') == 8
print('PASS: all eight download action/callback ID reads use the corrected parser', flush=True)
helper = method(web, 'private static long downloadId(')
methods = '\n'.join(method(dl, s) for s in [
    'private InputStream openSource(', 'public void copyKeptTo(', 'public String[] keptInfo(', 'private String viewMime('
])
java = r'''
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.Executor;
import org.json.JSONObject;

class Uri {
    final String value;
    Uri(String value) { this.value=value; }
    static Uri parse(String value) { return new Uri(value); }
    File file() { return new File(java.net.URI.create(value)); }
    public boolean equals(Object other) { return other instanceof Uri && value.equals(((Uri)other).value); }
    public int hashCode() { return value.hashCode(); }
}
class Resolver {
    InputStream openInputStream(Uri uri) throws IOException { return new FileInputStream(uri.file()); }
    OutputStream openOutputStream(Uri uri, String mode) throws IOException { return new FileOutputStream(uri.file(), false); }
}
class Context {
    Resolver getContentResolver() { return new Resolver(); }
}
class PluginCall {
    final JSONObject data;
    PluginCall(String json) { data=new JSONObject(json); }
    JSONObject getData() { return data; }
    // Exact behavior verified in Capacitor Android 7.6.10 PluginCall.getLong.
    Long getLong(String name, Long fallback) {
        Object value=data.opt(name);
        if (value == null) return fallback;
        if (value instanceof Long) return (Long)value;
        return fallback;
    }
}
class FBDownloader {
    interface Done { void on(String err, String info); }
    static class Job {
        long id;
        String name="file.pdf",mime="application/octet-stream",path="",uri="",state="completed";
    }
    final Path root;
    final Context ctx=new Context();
    final Executor pool=Runnable::run;
    final Map<Long,Job> jobs=new HashMap<>();
    FBDownloader(Path root) { this.root=root; }
    File keepFile(Job job) { return root.resolve("kept-"+job.id).toFile(); }
    Uri resolveSaved(Job job) {
        if (job.uri.isEmpty()) return null;
        Uri uri=Uri.parse(job.uri);
        return uri.file().isFile() ? uri : null;
    }
    // Android MimeTypeMap is mocked; parser selection logic is production code.
    static String mimeByName(String name) { return name.endsWith(".pdf") ? "application/pdf" : "*/*"; }
    Job add(long id, byte[] kept, File publicFile) throws IOException {
        Job job=new Job(); job.id=id;
        if (kept != null) Files.write(keepFile(job).toPath(),kept);
        if (publicFile != null) job.uri=publicFile.toURI().toString();
        jobs.put(id,job); return job;
    }
__METHODS__
}
public class NativeDownloadRegression {
__HELPER__
    static int checks=0;
    static void check(boolean yes, String label) {
        if (!yes) throw new AssertionError(label);
        checks++; System.out.println("PASS: "+label);
    }
    static String copy(FBDownloader dl, long id, Uri dest) {
        final String[] error={"callback missing"}; final int[] count={0};
        dl.copyKeptTo(id,dest,(err,info)->{error[0]=err;count[0]++;});
        if(count[0]!=1) throw new AssertionError("copy callback must resolve exactly once");
        return error[0];
    }
    static Uri at(Path path) { return Uri.parse(path.toUri().toString()); }
    public static void main(String[] args) throws Exception {
        PluginCall small=new PluginCall("{\"id\":1}");
        check(small.getData().opt("id") instanceof Integer,"JSON small IDs are Integer values");
        check(small.getLong("id",-1L)==-1L,"original Capacitor Long-only read reproduces the missing-job bug");
        check(downloadId(small)==1L,"corrected parser accepts a normal download ID");
        check(downloadId(new PluginCall("{\"id\":2147483648}"))==2147483648L,"large Long IDs remain supported");
        PluginCall floating=new PluginCall("{}");floating.getData().put("id",7.0d);
        check(downloadId(floating)==7L,"integer-valued Double bridge IDs are supported");
        for(String bad:new String[]{"{}","{\"id\":null}","{\"id\":\"1\"}","{\"id\":true}","{\"id\":0}","{\"id\":-1}","{\"id\":1.5}","{\"id\":9007199254740992}"})
            check(downloadId(new PluginCall(bad))==-1L,"invalid ID is rejected: "+bad);
        Path root=Paths.get(args[0]);
        FBDownloader dl=new FBDownloader(root);
        byte[] bytes=new byte[]{0,1,2,3,-1,20};
        dl.add(1,bytes,null);
        check(dl.keptInfo(1)!=null,"Save As accepts a retained download");
        Path retainedOut=root.resolve("retained-copy.pdf");
        check(copy(dl,1,at(retainedOut))==null && Arrays.equals(Files.readAllBytes(retainedOut),bytes),"Save As copies retained bytes exactly");
        dl.add(2,new byte[0],null);
        Path emptyOut=root.resolve("empty-copy.pdf");
        check(dl.keptInfo(2)!=null && copy(dl,2,at(emptyOut))==null && Files.size(emptyOut)==0,"empty retained files are valid Save As sources");
        Path publicSource=root.resolve("public.pdf");Files.write(publicSource,bytes);dl.add(3,null,publicSource.toFile());
        Path publicOut=root.resolve("public-copy.pdf");
        check(dl.keptInfo(3)!=null,"Save As accepts a public-only legacy/fallback download");
        check(copy(dl,3,at(publicOut))==null && Arrays.equals(Files.readAllBytes(publicOut),bytes),"Save As copies public-only bytes exactly");
        check(copy(dl,3,Uri.parse(dl.jobs.get(3L).uri))!=null && Arrays.equals(Files.readAllBytes(publicSource),bytes),"Save As does not truncate the same source URI");
        Path publicEmpty=root.resolve("public-empty.pdf");Files.write(publicEmpty,new byte[0]);dl.add(4,null,publicEmpty.toFile());
        check(dl.keptInfo(4)!=null && copy(dl,4,at(root.resolve("public-empty-copy.pdf")))==null,"empty public-only files also work");
        dl.add(5,null,null);
        check(dl.keptInfo(5)==null && dl.keptInfo(999)==null,"missing files and unknown jobs cannot launch Save As");
        Path missingOut=root.resolve("must-not-be-created.pdf");
        check(copy(dl,5,at(missingOut))!=null && !Files.exists(missingOut),"missing source fails before a destination is created");
        dl.jobs.get(1L).state="downloading";
        check(dl.keptInfo(1)==null && copy(dl,1,at(root.resolve("unfinished.pdf")))!=null,"unfinished downloads cannot be copied");
        check(copy(dl,3,null)!=null,"missing save destination produces a resolved error");
        check("application/pdf".equals(dl.keptInfo(3)[1]),"generic MIME type falls back to the filename mapping");
        dl.jobs.get(3L).mime="APPLICATION/PDF; charset=UTF-8";
        check("application/pdf".equals(dl.keptInfo(3)[1]),"viewer MIME is normalized and charset parameters removed");
        System.out.println("All "+checks+" extracted native-method checks passed (Android APIs mocked).");
    }
}
'''.replace('__METHODS__', methods).replace('__HELPER__', helper)
with tempfile.TemporaryDirectory(prefix='festers-download-tests-') as temp:
    temp = Path(temp)
    jar = Path(os.environ['JSON_JAR']) if os.environ.get('JSON_JAR') else temp / 'json.jar'
    if not jar.exists():
        urllib.request.urlretrieve('https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar', jar)
    source = temp / 'NativeDownloadRegression.java'
    source.write_text(java)
    subprocess.run(['javac','-cp',str(jar),'-d',str(temp),str(source)],check=True)
    files = temp / 'files'
    files.mkdir()
    subprocess.run(['java','-cp',os.pathsep.join([str(temp),str(jar)]),'NativeDownloadRegression',str(files)],check=True)
