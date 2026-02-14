<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';

	export let markdown = '';
	export let className = '';

	let svgEl: SVGSVGElement | null = null;

	let mm: any = null;
	let Transformer: any;
	let Markmap: any;
	let loadCSS: any;
	let loadJS: any;
	let markmapModule: any;
	let transformer: any;

	let _lastRenderedMd = '';
	let _rendering = false;
	let _pending = false;
	let _destroyed = false;

	async function ensureLibs() {
		if (!browser) return;
		if (Transformer && Markmap && transformer) return;

		const lib = await import('markmap-lib');
		({ Transformer } = lib);

		const view = await import('markmap-view');
		({ Markmap, loadCSS, loadJS } = view);
		markmapModule = view;

		transformer = new Transformer(); // 默认内置插件（含 frontmatter 等）
	}

	function sanitize(md: string) {
		// 防御性处理：避免有人把 <script> 混进 markdown（即使在代码块里也不该执行）
		return (md || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
	}

	async function render() {
		if (!browser || !svgEl) return;
		if (_rendering) {
			_pending = true;
			return;
		}

		_rendering = true;
		_pending = false;

		// snapshot：避免渲染过程中 markdown 变化导致状态错乱
		const mdRaw = markdown;
		_lastRenderedMd = mdRaw;

		try {
			await ensureLibs();
			if (_destroyed || !transformer || !Markmap || !svgEl) return;

			const md = sanitize(mdRaw);

			// 1) transform
			const { root, features } = transformer.transform(md);

			// 2) assets（兼容 frontmatter / katex / prism 等扩展）
			const assets = transformer.getUsedAssets(features);
			if (assets?.styles?.length) loadCSS(assets.styles);
			if (assets?.scripts?.length) {
				await loadJS(assets.scripts, { getMarkmap: () => markmapModule });
			}

			// 3) render / update
			if (mm?.setData) {
				mm.setData(root);
			} else {
				try {
					mm?.destroy?.();
				} catch {}
				mm = Markmap.create(svgEl, undefined, root);
			}

			// fit
			try {
				mm?.fit?.();
			} catch {}
		} finally {
			_rendering = false;
			if (!_destroyed && _pending && markdown !== _lastRenderedMd) {
				// 如果期间又来了一次更新，补一次渲染
				render();
			}
		}
	}

	onMount(() => {
		render();
	});

	$: if (browser && svgEl && markdown !== _lastRenderedMd) {
		render();
	}

	onDestroy(() => {
		_destroyed = true;
		try {
			mm?.destroy?.();
		} catch {}
	});
</script>

<div
	class={
		'w-full rounded-2xl border border-gray-200/30 dark:border-gray-700/60 ' +
		'bg-white dark:bg-black shadow-sm overflow-hidden ' +
		className
	}
>
	<div class="flex items-center justify-between px-3 py-2 text-xs border-b border-gray-200/20 dark:border-gray-700/40">
		<div class="opacity-80">Markmap 预览</div>
		<div class="opacity-60">拖拽移动 · 滚轮缩放</div>
	</div>
	<div class="w-full h-[70vh] min-h-[520px] p-2">
		<svg bind:this={svgEl} class="w-full h-full"></svg>
	</div>
</div>
