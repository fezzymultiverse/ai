#!/usr/bin/env python3
"""Integrate only the V1.99.62 web repair into a COMPLETE existing Horizon project.
Dry run by default. Does not compile/sign an APK or replace native plugins.
Usage: python3 scripts/apply_repair_v62.py /path/to/full/horizon --apply
"""
from pathlib import Path
import argparse,datetime,json,re,shutil,sys
FILES=['index.html','horizon_net.js','horizon_addons.js','horizon_dash.js','horizon_maps.js','horizon_maps.css','horizon_browser.js','horizon_rss.js','horizon_release.js','horizon_toolpolicy.js','horizon_about.js','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css','vendor/leaflet/LICENSE']
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('project',type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 source=Path(__file__).resolve().parents[1];target=args.project.expanduser().resolve()
 if source==target:parser.error('Use your COMPLETE Android project as target, not this extracted asset package.')
 if not (target/'package.json').is_file() or not (target/'android').is_dir():parser.error('Target must contain package.json and android/. The uploaded assets alone are not an Android build project.')
 package=json.loads((target/'package.json').read_text());deps={**package.get('dependencies',{}),**package.get('devDependencies',{})}
 if '@capacitor/core' not in deps:parser.error('Target does not declare @capacitor/core; refusing an unrelated project.')
 # Honor configured webDir rather than silently writing into the wrong directory.
 web='www';config=target/'capacitor.config.json';cfg=None
 if config.is_file():cfg=json.loads(config.read_text());web=cfg.get('webDir','www')
 else:
  for ext in ['ts','js']:
   text=(target/f'capacitor.config.{ext}').read_text() if (target/f'capacitor.config.{ext}').exists() else ''
   m=re.search(r"webDir\s*:\s*['\"]([^'\"]+)['\"]",text)
   if m:web=m.group(1);break
 dest=(target/web).resolve()
 if target not in dest.parents:parser.error('Configured webDir must be inside the target project.')
 missing=[name for name in FILES if not (source/'www'/name).is_file()]
 if missing:parser.error('Repair package is incomplete: '+', '.join(missing))
 print(('APPLY' if args.apply else 'DRY RUN')+' V1.99.62 -> '+str(dest))
 for name in FILES:print('  '+name)
 if not args.apply:
  print('No files changed. Add --apply after reviewing the target.');return
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');backup=target/'.horizon-backups'/('v1.99.62-'+stamp)
 for name in FILES:
  old=dest/name
  if old.exists():b=backup/web/name;b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(old,b)
  old.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/'www'/name,old)
 if cfg is not None:
  backup.mkdir(parents=True,exist_ok=True);shutil.copy2(config,backup/config.name)
  cfg.setdefault('plugins',{}).setdefault('CapacitorHttp',{})['enabled']=True;config.write_text(json.dumps(cfg,indent=2)+'\n')
 else:print('CHECK: In your Capacitor TS/JS config, plugins.CapacitorHttp.enabled must be true. This script does not rewrite TS/JS config.')
 print('Backup: '+str(backup))
 print('Next: run npx cap sync android in the complete project, then your existing Gradle build/signing workflow.')
 print('Preserve all existing Horizon native plugins. Verify Android Location permission, fresh getLocation and selected TTS on a real phone.')
 print('G4F Local additionally needs a running local server and a loopback-only HTTP exception in Android network security; do NOT enable cleartext globally.')
if __name__=='__main__':main()
