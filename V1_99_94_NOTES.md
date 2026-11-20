# V1.99.94 - OpenRouter: your 15 free models

Why they were missing: the OpenRouter picker seed was empty, so nothing showed until a live Refresh. It now holds your list (implemented, unit tested): meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-chat-v3.1:free, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, nvidia/nemotron-3-ultra-550b-a55b:free, nvidia/nemotron-3.5-lightning:free, nvidia/nemotron-3.5-super-vl:free, recursive/flint-v1.0:free, xingchen-agi/xing4.0-29b-a4b:free, baidu/ernie-5.5-flash-preview:free, cohere/north-mini-code:free, dots-studio/dots-3-note-preview:free, google/gemma-4-26b-a4b-it:free, google/gemma-4-31b-it:free, liquid/lfm-2.5-2.6b:free, liquid/lfm-3-1.7b:free.

- Default is Llama 3.3 70B free. No openrouter/free or auto router in the list; you pick by hand and a swapped model is refused.
- Your list started at item 7, so items 1-6 were never received. Send them and they go in front.
- Not probed on a device: whether each answers right now is untested. Refresh on OpenRouter still keeps only zero-price models.
No APK rebuild needed.
