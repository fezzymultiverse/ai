#include <jni.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <fcntl.h>
#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1 << 0)
#endif
/* Atomic, kernel-enforced no-clobber rename. There is deliberately no fallback. */
static jint rename_no_replace(JNIEnv *env, jclass cls, jbyteArray source, jbyteArray target) {
    (void)cls;
    jsize sn = (*env)->GetArrayLength(env, source), tn = (*env)->GetArrayLength(env, target);
    char *s = calloc((size_t)sn + 1, 1), *t = calloc((size_t)tn + 1, 1);
    if (!s || !t) { free(s); free(t); return ENOMEM; }
    (*env)->GetByteArrayRegion(env, source, 0, sn, (jbyte *)s);
    (*env)->GetByteArrayRegion(env, target, 0, tn, (jbyte *)t);
    int result;
#ifdef __NR_renameat2
    result = syscall(__NR_renameat2, AT_FDCWD, s, AT_FDCWD, t, RENAME_NOREPLACE) == 0 ? 0 : errno;
#else
    result = ENOSYS;
#endif
    free(s); free(t); return result;
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
    (void)reserved;
    JNIEnv *env = NULL;
    if ((*vm)->GetEnv(vm, (void **)&env, JNI_VERSION_1_6) != JNI_OK) return JNI_ERR;
    jclass cls = (*env)->FindClass(env, "__APPIDPATH__/HorizonFilesState");
    if (!cls) return JNI_ERR;
    JNINativeMethod methods[] = {{"renameNoReplace", "([B[B)I", (void *)rename_no_replace}};
    if ((*env)->RegisterNatives(env, cls, methods, 1) != JNI_OK) return JNI_ERR;
    return JNI_VERSION_1_6;
}
