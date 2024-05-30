import { computePosition } from "@floating-ui/dom";
import { box } from "svelte-toolbelt";
import type { UseFloatingOptions, UseFloatingReturn } from "./types.js";
import { get, getDPR, roundByDPR } from "./utils.js";

export function useFloating(options: UseFloatingOptions): UseFloatingReturn {
	/** Options */
	const whileElementsMountedOption = options.whileElementsMounted;
	const openOption = $derived(get(options.open) ?? true);
	const middlewareOption = $derived(get(options.middleware));
	const transformOption = $derived(get(options.transform) ?? true);
	const placementOption = $derived(get(options.placement) ?? "bottom");
	const strategyOption = $derived(get(options.strategy) ?? "absolute");
	const reference = options.reference;

	/** State */
	let x = $state(0);
	let y = $state(0);

	const floating = box<HTMLElement | null>(null);

	let strategy = $state(strategyOption);
	let placement = $state(placementOption);
	let middlewareData = $state({});
	let isPositioned = $state(false);
	const floatingStyles = $derived.by(() => {
		const initialStyles = {
			position: strategy,
			left: "0",
			top: "0",
		};

		if (!floating.value) {
			return initialStyles;
		}

		const xVal = roundByDPR(floating.value, x);
		const yVal = roundByDPR(floating.value, y);

		if (transformOption) {
			return {
				...initialStyles,
				transform: `translate(${xVal}px, ${yVal}px)`,
				...(getDPR(floating.value) >= 1.5 && {
					willChange: "transform",
				}),
			};
		}

		return {
			position: strategy,
			left: `${xVal}px`,
			top: `${yVal}px`,
		};
	});

	/** Effects */
	let whileElementsMountedCleanup: (() => void) | undefined;

	function update() {
		if (reference.value === null || floating.value === null) return;
		computePosition(reference.value, floating.value, {
			middleware: middlewareOption,
			placement: placementOption,
			strategy: strategyOption,
		}).then((position) => {
			x = position.x;
			y = position.y;
			strategy = position.strategy;
			placement = position.placement;
			middlewareData = position.middlewareData;
			isPositioned = true;
		});
	}

	function cleanup() {
		if (typeof whileElementsMountedCleanup === "function") {
			whileElementsMountedCleanup();
			whileElementsMountedCleanup = undefined;
		}
	}

	function attach() {
		cleanup();

		if (whileElementsMountedOption === undefined) {
			update();
			return;
		}

		if (reference.value === null || floating.value === null) return;

		whileElementsMountedCleanup = whileElementsMountedOption(
			reference.value,
			floating.value,
			update
		);
	}

	function reset() {
		if (!openOption) {
			isPositioned = false;
		}
	}

	$effect(update);
	$effect(attach);
	$effect(reset);
	$effect(() => cleanup);

	return {
		floating,
		reference,
		get strategy() {
			return strategy;
		},
		get placement() {
			return placement;
		},
		get middlewareData() {
			return middlewareData;
		},
		get isPositioned() {
			return isPositioned;
		},
		get floatingStyles() {
			return floatingStyles;
		},
		get update() {
			return update;
		},
	};
}