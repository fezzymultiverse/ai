# V1.99.93 - your researched models added

Changed: www/horizon_model_inventory.js, www/index.html (LLM7 picker blurbs), horizon_about.js, horizon_release.js, package.json files, tests (v55, front-header). New: tests/keyless-picks-v93.test.cjs.

1. BlockRun: cohere/north-mini-code added to the picker seed (implemented, unit tested).
2. LLM7.io: DeepSeek-V4.1-Flash and Inkling-Small added to the seed and test candidates. DeepSeek V4.1 no longer shows the R1 description.
3. Manual pick only (tested): Horizon never walks to another model. If BlockRun (or any provider) answers as a different model than the one you picked, the reply is refused with "Model substitution refused". BlockRun's server-side borrowed-capacity routing cannot be switched off from the app; this check is what catches it. If the provider hides the model name in its reply, the app cannot see a swap.
4. Not probed: these models come from your research, not a probe, so whether they answer is untested. LLM7 has not published pricing for the two new ones.
5. Refresh on LLM7 keeps only models LLM7 marks free or turbo, so a Refresh may drop the two new LLM7 models if LLM7 does not mark them. Tell me if you want them pinned.
No APK rebuild needed beyond V1.99.92.
