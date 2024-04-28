import { type ReadableBox, box, useEventListener } from "runed";
import { TOOLTIP_OPEN_EVENT } from "./utils.js";
import {
	type ReadableBoxedValues,
	type WritableBoxedValues,
	watch,
} from "$lib/internal/box.svelte.js";
import { useTimeoutFn } from "$lib/internal/useTimeoutFn.svelte.js";
import { useNodeById } from "$lib/internal/useNodeById.svelte.js";
import { isElementOrSVGElement } from "$lib/internal/is.js";
import { useGraceArea } from "$lib/internal/useGraceArea.svelte.js";
import { createContext } from "$lib/internal/createContext.js";
import { getDataDisabled } from "$lib/internal/attrs.js";

type TooltipProviderStateProps = ReadableBoxedValues<{
	delayDuration: number;
	disableHoverableContent: boolean;
	disableCloseOnTriggerClick: boolean;
	disabled: boolean;
	ignoreNonKeyboardFocus: boolean;
	skipDelayDuration: number;
}>;

class TooltipProviderState {
	delayDuration: TooltipProviderStateProps["delayDuration"];
	disableHoverableContent: TooltipProviderStateProps["disableHoverableContent"];
	disableCloseOnTriggerClick: TooltipProviderStateProps["disableCloseOnTriggerClick"];
	disabled: TooltipProviderStateProps["disabled"];
	ignoreNonKeyboardFocus: TooltipProviderStateProps["ignoreNonKeyboardFocus"];
	skipDelayDuration: TooltipProviderStateProps["skipDelayDuration"];
	isOpenDelayed = box(true);
	isPointerInTransit = box(false);
	#timerFn: ReturnType<typeof useTimeoutFn>;

	constructor(props: TooltipProviderStateProps) {
		this.delayDuration = props.delayDuration;
		this.disableHoverableContent = props.disableHoverableContent;
		this.disableCloseOnTriggerClick = props.disableCloseOnTriggerClick;
		this.disabled = props.disabled;
		this.ignoreNonKeyboardFocus = props.ignoreNonKeyboardFocus;
		this.skipDelayDuration = props.skipDelayDuration;
		this.#timerFn = useTimeoutFn(
			() => {
				this.isOpenDelayed.value = true;
			},
			this.skipDelayDuration.value,
			{ immediate: false }
		);
	}

	#startTimer() {
		this.#timerFn.start();
	}

	#clearTimer() {
		this.#timerFn.stop();
	}

	onOpen() {
		this.#clearTimer();
		this.isOpenDelayed.value = false;
	}

	onClose() {
		this.#startTimer();
	}

	createRoot(props: TooltipRootStateProps) {
		return new TooltipRootState(props, this);
	}
}

type TooltipRootStateProps = ReadableBoxedValues<{
	delayDuration: number;
	disableHoverableContent: boolean;
	disableCloseOnTriggerClick: boolean;
	disabled: boolean;
	ignoreNonKeyboardFocus: boolean;
}> &
	WritableBoxedValues<{
		open: boolean;
	}>;

class TooltipRootState {
	open: TooltipRootStateProps["open"];
	_delayDuration: TooltipRootStateProps["delayDuration"];
	_disableHoverableContent: TooltipRootStateProps["disableHoverableContent"];
	_disableCloseOnTriggerClick: TooltipRootStateProps["disableCloseOnTriggerClick"];
	_disabled: TooltipRootStateProps["disabled"];
	_ignoreNonKeyboardFocus: TooltipRootStateProps["ignoreNonKeyboardFocus"];
	provider: TooltipProviderState;
	delayDuration = $derived.by(
		() => this._delayDuration.value ?? this.provider.delayDuration.value
	);
	disableHoverableContent = $derived.by(
		() => this._disableHoverableContent.value ?? this.provider.disableHoverableContent.value
	);
	disableCloseOnTriggerClick = $derived.by(
		() =>
			this._disableCloseOnTriggerClick.value ?? this.provider.disableCloseOnTriggerClick.value
	);
	disabled = $derived.by(() => this._disabled.value ?? this.provider.disabled.value);
	ignoreNonKeyboardFocus = $derived.by(
		() => this._ignoreNonKeyboardFocus.value ?? this.provider.ignoreNonKeyboardFocus.value
	);
	contentNode = box<HTMLElement | null>(null);
	contentId: ReadableBox<string> = box.with(() => "");
	triggerId: ReadableBox<string> = box.with(() => "");
	triggerNode = box<HTMLElement | null>(null);
	#wasOpenDelayed = $state(false);
	#timerFn: ReturnType<typeof useTimeoutFn>;
	stateAttr = $derived.by(() => {
		if (!this.open.value) return "closed";
		return this.#wasOpenDelayed ? "delayed-open" : "instant-open";
	});

	constructor(props: TooltipRootStateProps, provider: TooltipProviderState) {
		this.provider = provider;
		this.open = props.open;
		this._delayDuration = props.delayDuration;
		this._disableHoverableContent = props.disableHoverableContent;
		this._disableCloseOnTriggerClick = props.disableCloseOnTriggerClick;
		this._disabled = props.disabled;
		this._ignoreNonKeyboardFocus = props.ignoreNonKeyboardFocus;
		this.#timerFn = useTimeoutFn(
			() => {
				this.#wasOpenDelayed = true;
				this.open.value = true;
			},
			this._delayDuration.value,
			{ immediate: false }
		);

		watch(this.open, (isOpen) => {
			if (!this.provider.onClose) return;
			if (isOpen) {
				this.provider.onOpen();

				document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT));
			} else {
				this.provider.onClose();
			}
		});
	}

	handleOpen() {
		this.#timerFn.stop();
		this.#wasOpenDelayed = false;
		this.open.value = true;
	}

	handleClose() {
		this.#timerFn.stop();
		this.open.value = false;
	}

	#handleDelayedOpen() {
		this.#timerFn.start();
	}

	onTriggerEnter() {
		this.#handleDelayedOpen();
	}

	onTriggerLeave() {
		if (this.disableHoverableContent) {
			this.handleClose();
		} else {
			this.#timerFn.stop();
		}
	}

	createTrigger(props: TooltipTriggerStateProps) {
		return new TooltipTriggerState(props, this);
	}

	createContent(props: TooltipContentStateProps) {
		return new TooltipContentState(props, this);
	}
}

type TooltipTriggerStateProps = ReadableBoxedValues<{
	id: string;
	disabled: boolean;
}>;

class TooltipTriggerState {
	#id: TooltipTriggerStateProps["id"];
	#root: TooltipRootState;
	#isPointerDown = box(false);
	#hasPointerMoveOpened = $state(false);
	#disabled: TooltipTriggerStateProps["disabled"];
	#isDisabled = $derived.by(() => this.#disabled.value || this.#root.disabled);

	constructor(props: TooltipTriggerStateProps, root: TooltipRootState) {
		this.#id = props.id;
		this.#root = root;
		this.#disabled = props.disabled;
		this.#root.triggerNode = useNodeById(this.#id);
		this.#root.triggerId = props.id;
	}

	handlePointerUp() {
		this.#isPointerDown.value = false;
	}

	#onpointerup = () => {
		if (this.#isDisabled) return;
		this.#isPointerDown.value = false;
	};

	#onpointerdown = () => {
		if (this.#isDisabled) return;
		this.#isPointerDown.value = true;
		document.addEventListener(
			"pointerup",
			() => {
				this.handlePointerUp();
			},
			{ once: true }
		);
	};

	#onpointermove = (e: PointerEvent) => {
		if (this.#isDisabled) return;
		if (e.pointerType === "touch") return;
		if (this.#hasPointerMoveOpened || this.#root.provider.isPointerInTransit.value) return;
		this.#root.onTriggerEnter();
		this.#hasPointerMoveOpened = true;
	};

	#onpointerleave = () => {
		if (this.#isDisabled) return;
		this.#root.onTriggerLeave();
		this.#hasPointerMoveOpened = false;
	};

	#onfocus = (e: FocusEvent) => {
		if (this.#isPointerDown.value || this.#isDisabled) {
			return;
		}

		if (
			this.#root.ignoreNonKeyboardFocus &&
			!(e.target as HTMLElement).matches(":focus-visible")
		) {
			return;
		}

		this.#root.handleOpen();
	};

	#onblur = () => {
		if (this.#isDisabled) return;
		this.#root.handleClose();
	};

	#onclick = () => {
		if (this.#root.disableCloseOnTriggerClick || this.#isDisabled) return;
		this.#root.handleClose();
	};

	props = $derived.by(() => ({
		id: this.#id.value,
		"aria-describedby": this.#root.open.value ? this.#root.contentNode.value?.id : undefined,
		"data-state": this.#root.stateAttr,
		"data-disabled": getDataDisabled(this.#isDisabled),
		"data-tooltip-trigger": "",
		tabindex: this.#isDisabled ? undefined : 0,
		onpointerup: this.#onpointerup,
		onpointerdown: this.#onpointerdown,
		onpointermove: this.#onpointermove,
		onpointerleave: this.#onpointerleave,
		onfocus: this.#onfocus,
		onblur: this.#onblur,
		onclick: this.#onclick,
	}));
}

type TooltipContentStateProps = ReadableBoxedValues<{
	id: string;
}>;

class TooltipContentState {
	root: TooltipRootState;
	#id: TooltipContentStateProps["id"];

	constructor(props: TooltipContentStateProps, root: TooltipRootState) {
		this.root = root;
		this.#id = props.id;
		const contentNode = useNodeById(this.#id);
		this.root.contentNode = contentNode;
		this.root.contentId = this.#id;

		$effect(() => {
			if (!this.root.open.value) return;
			if (this.root.disableHoverableContent) return;
			const { isPointerInTransit, onPointerExit } = useGraceArea(
				box.with(() => this.root.triggerId?.value),
				box.with(() => this.root.contentId?.value)
			);

			this.root.provider.isPointerInTransit = isPointerInTransit;
			onPointerExit(() => {
				this.root.handleClose();
			});
		});

		$effect(() => {
			useEventListener(window, "scroll", (e) => {
				const target = e.target;
				if (!isElementOrSVGElement(target)) return;
				if (target.contains(this.root.triggerNode.value)) {
					this.root.handleClose();
				}
			});

			useEventListener(window, TOOLTIP_OPEN_EVENT, this.root.handleClose);
		});
	}

	props = $derived.by(() => ({
		id: this.#id.value,
		"data-state": this.root.stateAttr,
		"data-disabled": getDataDisabled(this.root.disabled),
		"data-tooltip-content": "",
	}));
}

//
// CONTEXT METHODS
//

const [setTooltipProviderContext, getTooltipProviderContext] =
	createContext<TooltipProviderState>("Tooltip.Provider");

const [setTooltipRootContext, getTooltipRootContext] =
	createContext<TooltipRootState>("Tooltip.Root");

export function useTooltipProvider(props: TooltipProviderStateProps) {
	return setTooltipProviderContext(new TooltipProviderState(props));
}

export function useTooltipRoot(props: TooltipRootStateProps) {
	return setTooltipRootContext(getTooltipProviderContext().createRoot(props));
}

export function useTooltipTrigger(props: TooltipTriggerStateProps) {
	return getTooltipRootContext().createTrigger(props);
}

export function useTooltipContent(props: TooltipContentStateProps) {
	return getTooltipRootContext().createContent(props);
}