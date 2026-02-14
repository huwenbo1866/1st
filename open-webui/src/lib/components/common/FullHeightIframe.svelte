<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';

	// Props
	export let src: string | null = null; // URL or raw HTML (auto-detected)
	export let title = 'Embedded Content';
	export let initialHeight: number | null = null; // initial height in px, null = auto

	// ✅ 默认给出“卡片”外观，避免与 UI 融在一起
	export let iframeClassName =
		'w-full rounded-2xl border border-gray-200/30 dark:border-gray-700/60 bg-white dark:bg-gray-950 shadow-lg';

	export let args = null;

	export let allowScripts = true;
	export let allowForms = false;

	export let allowSameOrigin = false; // set to true only when you trust the content
	export let allowPopups = false;
	export let allowDownloads = true;

	export let referrerPolicy: HTMLIFrameElement['referrerPolicy'] =
		'strict-origin-when-cross-origin';
	export let allowFullscreen = true;

	export let payload = null; // payload to send into the iframe on request

	let iframe: HTMLIFrameElement | null = null;
	let iframeSrc: string | null = null;
	let iframeDoc: string | null = null;

	// ---- Height floor: prevents tiny iframe ----
	const MIN_VH = 70; // floor in viewport height
	const MIN_PX = () => Math.floor((window?.innerHeight ?? 900) * (MIN_VH / 100));

	function applyHeight(px: number) {
		if (!iframe) return;
		const min = MIN_PX();
		const h = Math.max(min, Math.floor(px));
		iframe.style.height = h + 'px';
		iframe.style.minHeight = MIN_VH + 'vh';
	}

	function applyFloor() {
		applyHeight(MIN_PX());
	}

	// Derived: build sandbox attribute from flags
	$: sandbox =
		[
			allowScripts && 'allow-scripts',
			allowForms && 'allow-forms',
			allowSameOrigin && 'allow-same-origin',
			allowPopups && 'allow-popups',
			allowDownloads && 'allow-downloads'
		]
			.filter(Boolean)
			.join(' ') || undefined;

	// Detect URL vs raw HTML and prep src/srcdoc
	$: isUrl = typeof src === 'string' && /^(https?:)?\/\//i.test(src);
	$: if (src) {
		setIframeSrc();
	}

	const setIframeSrc = async () => {
		await tick();
		if (isUrl) {
			iframeSrc = src as string;
			iframeDoc = null;
		} else {
			iframeDoc = await processHtmlForDeps(src as string);
			iframeSrc = null;
		}
	};

	// Alpine directives detection
	const alpineDirectives = [
		'x-data',
		'x-init',
		'x-show',
		'x-bind',
		'x-on',
		'x-text',
		'x-html',
		'x-model',
		'x-modelable',
		'x-ref',
		'x-for',
		'x-if',
		'x-effect',
		'x-transition',
		'x-cloak',
		'x-ignore',
		'x-teleport',
		'x-id'
	];

	async function processHtmlForDeps(html: string): Promise<string> {
		if (!allowSameOrigin) return html;

		const scriptTags: string[] = [];

		// ✅ Markmap 画布增强：加粗黑边框 + 阴影（不改背景）
		const looksLikeMarkmap =
		  html.includes('markmap') ||
		  html.includes('markmap-view') ||
		  html.includes('svg class="markmap"') ||
		  html.includes('markmap-autoloader');
		
		if (looksLikeMarkmap) {
		  const mmFrameCss = `<style>
		/* --- OpenWebUI: Markmap frame (border + shadow) --- */
		svg.markmap {
		  border: 2px solid rgba(0,0,0,0.55) !important;
		  border-radius: 14px !important;
		  box-shadow: 0 10px 26px rgba(0,0,0,0.18) !important;
		  background: transparent !important;
		}
		
		/* 让工具栏也更清晰一点（可选） */
		.mm-toolbar {
		  border: 1px solid rgba(0,0,0,0.18) !important;
		  box-shadow: 0 8px 18px rgba(0,0,0,0.12) !important;
		  border-radius: 10px !important;
		}
		</style>`;
		  scriptTags.push(mmFrameCss);
		}

		// Alpine.js detection & injection
		const hasAlpineDirectives = alpineDirectives.some((dir) => html.includes(dir));
		if (hasAlpineDirectives) {
			try {
				const { default: alpineCode } = await import('alpinejs/dist/cdn.min.js?raw');
				const alpineBlob = new Blob([alpineCode], { type: 'text/javascript' });
				const alpineUrl = URL.createObjectURL(alpineBlob);
				scriptTags.push(`<script src="${alpineUrl}" defer><\/script>`);
			} catch (error) {
				console.error('Error processing Alpine for iframe:', error);
			}
		}

		// Chart.js detection & injection
		const chartJsDirectives = ['new Chart(', 'Chart.'];
		const hasChartJsDirectives = chartJsDirectives.some((dir) => html.includes(dir));
		if (hasChartJsDirectives) {
			try {
				const { default: Chart } = await import('chart.js/auto');
				(window as any).Chart = Chart;
				scriptTags.push(`<script>
window.Chart = parent.Chart;
<\/script>`);
			} catch (error) {
				console.error('Error processing Chart.js for iframe:', error);
			}
		}

		if (scriptTags.length === 0) return html;

		const tags = scriptTags.join('\n');
		if (html.includes('</head>')) return html.replace('</head>', `${tags}\n</head>`);
		if (html.includes('</body>')) return html.replace('</body>', `${tags}\n</body>`);
		return `${tags}\n${html}`;
	}

	// Same-origin resize
	function resizeSameOrigin() {
		if (!iframe) return;
		try {
			const doc = iframe.contentDocument || iframe.contentWindow?.document;
			if (!doc) return;

			const h = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0);
			if (h > 0) applyHeight(h + 20);
		} catch {
			// Cross-origin: ignore, rely on postMessage
		}
	}

	function onMessage(e: MessageEvent) {
		if (!iframe || e.source !== iframe.contentWindow) return;

		const data = e.data || {};

		// ✅ enforce floor for postMessage heights too
		if (data?.type === 'iframe:height' && typeof data.height === 'number') {
			applyHeight(data.height);
		}

		if (data?.type === 'pong') {
			iframe.contentWindow?.postMessage({ type: 'pong:ack' }, '*');
		}

		if (data?.type === 'payload') {
			iframe.contentWindow?.postMessage(
				{ type: 'payload', requestId: data?.requestId ?? null, payload: payload },
				'*'
			);
		}
	}

	const onLoad = async () => {
		applyFloor();
		requestAnimationFrame(resizeSameOrigin);

		if (args && iframe?.contentWindow) (iframe.contentWindow as any).args = args;

		// async render retry
		let n = 0;
		const timer = setInterval(() => {
			resizeSameOrigin();
			n += 1;
			if (n >= 10) clearInterval(timer);
		}, 200);
	};

	onMount(() => {
		window.addEventListener('message', onMessage);
		if (initialHeight && iframe) applyHeight(initialHeight);
	});

	onDestroy(() => {
		window.removeEventListener('message', onMessage);
	});
</script>

{#if iframeDoc}
	<iframe
		bind:this={iframe}
		srcdoc={iframeDoc}
		{title}
		class={iframeClassName}
		style={`min-height:${MIN_VH}vh; height:${MIN_VH}vh;`}
		width="100%"
		frameborder="0"
		{sandbox}
		referrerpolicy={referrerPolicy}
		allowfullscreen={allowFullscreen}
		on:load={onLoad}
	/>
{:else if iframeSrc}
	<iframe
		bind:this={iframe}
		src={iframeSrc}
		{title}
		class={iframeClassName}
		style={`min-height:${MIN_VH}vh; height:${MIN_VH}vh;`}
		width="100%"
		frameborder="0"
		{sandbox}
		referrerpolicy={referrerPolicy}
		allowfullscreen={allowFullscreen}
		on:load={onLoad}
	/>
{/if}
