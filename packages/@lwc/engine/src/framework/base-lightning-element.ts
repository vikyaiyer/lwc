/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
/**
 * This module is responsible for producing the ComponentDef object that is always
 * accessible via `vm.def`. This is lazily created during the creation of the first
 * instance of a component class, and shared across all instances.
 *
 * This structure can be used to synthetically create proxies, and understand the
 * shape of a component. It is also used internally to apply extra optimizations.
 */
import {
    assert,
    create,
    defineProperties,
    isFunction,
    isNull,
    defineProperty,
    isObject,
} from '@lwc/shared';
import { HTMLElementOriginalDescriptors } from './html-properties';
import {
    ComponentInterface,
    getWrappedComponentsListener,
    getTemplateReactiveObserver,
} from './component';
import { vmBeingConstructed, isBeingConstructed, isInvokingRender } from './invoker';
import { associateVM, getAssociatedVM, VM } from './vm';
import { componentValueMutated, componentValueObserved } from './mutation-tracker';
import {
    patchComponentWithRestrictions,
    patchShadowRootWithRestrictions,
    patchLightningElementPrototypeWithRestrictions,
    patchCustomElementWithRestrictions,
} from './restrictions';
import { unlockAttribute, lockAttribute } from './attributes';
import { Template, isUpdatingTemplate, getVMBeingRendered } from './template';
import { logError } from '../shared/logger';
import { getComponentTag } from '../shared/format';
import { HTMLElementConstructor } from './base-bridge-element';

/**
 * This operation is called with a descriptor of an standard html property
 * that a Custom Element can support (including AOM properties), which
 * determines what kind of capabilities the Base Lightning Element should support. When producing the new descriptors
 * for the Base Lightning Element, it also include the reactivity bit, so the standard property is reactive.
 */
function createBridgeToElementDescriptor(
    propName: string,
    descriptor: PropertyDescriptor
): PropertyDescriptor {
    const { get, set, enumerable, configurable } = descriptor;
    if (!isFunction(get)) {
        if (process.env.NODE_ENV !== 'production') {
            assert.fail(
                `Detected invalid public property descriptor for HTMLElement.prototype.${propName} definition. Missing the standard getter.`
            );
        }
        throw new TypeError();
    }
    if (!isFunction(set)) {
        if (process.env.NODE_ENV !== 'production') {
            assert.fail(
                `Detected invalid public property descriptor for HTMLElement.prototype.${propName} definition. Missing the standard setter.`
            );
        }
        throw new TypeError();
    }
    return {
        enumerable,
        configurable,
        get(this: ComponentInterface) {
            const vm = getAssociatedVM(this);
            if (isBeingConstructed(vm)) {
                if (process.env.NODE_ENV !== 'production') {
                    logError(
                        `The value of property \`${propName}\` can't be read from the constructor because the owner component hasn't set the value yet. Instead, use the constructor to set a default value for the property.`,
                        vm
                    );
                }
                return;
            }
            componentValueObserved(vm, propName);
            return get.call(vm.elm);
        },
        set(this: ComponentInterface, newValue: any) {
            const vm = getAssociatedVM(this);
            if (process.env.NODE_ENV !== 'production') {
                const vmBeingRendered = getVMBeingRendered();
                assert.invariant(
                    !isInvokingRender,
                    `${vmBeingRendered}.render() method has side effects on the state of ${vm}.${propName}`
                );
                assert.invariant(
                    !isUpdatingTemplate,
                    `When updating the template of ${vmBeingRendered}, one of the accessors used by the template has side effects on the state of ${vm}.${propName}`
                );
                assert.isFalse(
                    isBeingConstructed(vm),
                    `Failed to construct '${getComponentTag(
                        vm
                    )}': The result must not have attributes.`
                );
                assert.invariant(
                    !isObject(newValue) || isNull(newValue),
                    `Invalid value "${newValue}" for "${propName}" of ${vm}. Value cannot be an object, must be a primitive value.`
                );
            }

            if (newValue !== vm.cmpProps[propName]) {
                vm.cmpProps[propName] = newValue;

                componentValueMutated(vm, propName);
            }
            return set.call(vm.elm, newValue);
        },
    };
}

interface ComponentHooks {
    callHook: VM['callHook'];
    setHook: VM['setHook'];
    getHook: VM['getHook'];
}

export interface LightningElementConstructor {
    new (): LightningElement;
    readonly prototype: LightningElement;
    readonly CustomElementConstructor: HTMLElementConstructor;
}

export declare var LightningElement: LightningElementConstructor;

type HTMLElementTheGoodParts = Pick<Object, 'toString'> &
    Pick<
        HTMLElement,
        | 'accessKey'
        | 'addEventListener'
        | 'classList'
        | 'dir'
        | 'dispatchEvent'
        | 'draggable'
        | 'getAttribute'
        | 'getAttributeNS'
        | 'getBoundingClientRect'
        | 'getElementsByClassName'
        | 'getElementsByTagName'
        | 'hasAttribute'
        | 'hasAttributeNS'
        | 'hidden'
        | 'id'
        | 'isConnected'
        | 'lang'
        | 'querySelector'
        | 'querySelectorAll'
        | 'removeAttribute'
        | 'removeAttributeNS'
        | 'removeEventListener'
        | 'setAttribute'
        | 'setAttributeNS'
        | 'spellcheck'
        | 'tabIndex'
        | 'title'
    >;

// Defined separately from HTMLElementTheGoodParts because, as of May 2020, the typescript interface
// for Element does not include these
interface AccessibleElementTheGoodParts {
    ariaActiveDescendant: string | null;
    ariaAtomic: string | null;
    ariaAutoComplete: string | null;
    ariaBusy: string | null;
    ariaChecked: string | null;
    ariaColCount: string | null;
    ariaColIndex: string | null;
    ariaColSpan: string | null;
    ariaControls: string | null;
    ariaCurrent: string | null;
    ariaDescribedBy: string | null;
    ariaDetails: string | null;
    ariaDisabled: string | null;
    ariaErrorMessage: string | null;
    ariaExpanded: string | null;
    ariaFlowTo: string | null;
    ariaHasPopup: string | null;
    ariaHidden: string | null;
    ariaInvalid: string | null;
    ariaKeyShortcuts: string | null;
    ariaLabel: string | null;
    ariaLabelledBy: string | null;
    ariaLevel: string | null;
    ariaLive: string | null;
    ariaModal: string | null;
    ariaMultiLine: string | null;
    ariaMultiSelectable: string | null;
    ariaOrientation: string | null;
    ariaOwns: string | null;
    ariaPlaceholder: string | null;
    ariaPosInSet: string | null;
    ariaPressed: string | null;
    ariaReadOnly: string | null;
    ariaRelevant: string | null;
    ariaRequired: string | null;
    ariaRoleDescription: string | null;
    ariaRowCount: string | null;
    ariaRowIndex: string | null;
    ariaRowSpan: string | null;
    ariaSelected: string | null;
    ariaSetSize: string | null;
    ariaSort: string | null;
    ariaValueMax: string | null;
    ariaValueMin: string | null;
    ariaValueNow: string | null;
    ariaValueText: string | null;
    role: string | null;
}

export interface LightningElement extends HTMLElementTheGoodParts, AccessibleElementTheGoodParts {
    template: ShadowRoot;
    render(): Template;
    connectedCallback?(): void;
    disconnectedCallback?(): void;
    renderedCallback?(): void;
    errorCallback?(error: any, stack: string): void;
}

/**
 * This class is the base class for any LWC element.
 * Some elements directly extends this class, others implement it via inheritance.
 **/
function BaseLightningElementConstructor(this: LightningElement) {
    // This should be as performant as possible, while any initialization should be done lazily
    if (isNull(vmBeingConstructed)) {
        throw new ReferenceError('Illegal constructor');
    }
    if (process.env.NODE_ENV !== 'production') {
        assert.invariant(
            vmBeingConstructed.elm instanceof HTMLElement,
            `Component creation requires a DOM element to be associated to ${vmBeingConstructed}.`
        );
    }
    const vm = vmBeingConstructed as VM;
    const {
        elm,
        mode,
        renderer,
        def: { ctor },
    } = vm;
    const component = this;
    vm.component = component;
    vm.tro = getTemplateReactiveObserver(vm);
    vm.oar = create(null);
    // interaction hooks
    // We are intentionally hiding this argument from the formal API of LWCElement because
    // we don't want folks to know about it just yet.
    if (arguments.length === 1) {
        const { callHook, setHook, getHook } = arguments[0] as ComponentHooks;
        vm.callHook = callHook;
        vm.setHook = setHook;
        vm.getHook = getHook;
    }
    // attaching the shadowRoot
    const shadowRootOptions = {
        mode,
        delegatesFocus: !!ctor.delegatesFocus,
        '$$lwc-synthetic-mode$$': true,
    };
    const cmpRoot = renderer.attachShadow(elm, shadowRootOptions);
    // linking elm, shadow root and component with the VM
    associateVM(component, vm);
    associateVM(cmpRoot, vm);
    associateVM(elm, vm);
    // VM is now initialized
    vm.cmpRoot = cmpRoot;
    if (process.env.NODE_ENV !== 'production') {
        patchCustomElementWithRestrictions(elm);
        patchComponentWithRestrictions(component);
        patchShadowRootWithRestrictions(cmpRoot);
    }
    return this as LightningElement;
}

BaseLightningElementConstructor.prototype = {
    constructor: BaseLightningElementConstructor,

    dispatchEvent(event: Event): boolean {
        const {
            elm,
            renderer: { dispatchEvent },
        } = getAssociatedVM(this);
        return dispatchEvent(elm, event);
    },

    addEventListener(
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions
    ): void {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { addEventListener },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            const vmBeingRendered = getVMBeingRendered();
            assert.invariant(
                !isInvokingRender,
                `${vmBeingRendered}.render() method has side effects on the state of ${vm} by adding an event listener for "${type}".`
            );
            assert.invariant(
                !isUpdatingTemplate,
                `Updating the template of ${vmBeingRendered} has side effects on the state of ${vm} by adding an event listener for "${type}".`
            );
            assert.invariant(
                isFunction(listener),
                `Invalid second argument for this.addEventListener() in ${vm} for event "${type}". Expected an EventListener but received ${listener}.`
            );
        }

        const wrappedListener = getWrappedComponentsListener(vm, listener);
        addEventListener(elm, type, wrappedListener, options);
    },

    removeEventListener(
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions
    ): void {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { removeEventListener },
        } = vm;

        const wrappedListener = getWrappedComponentsListener(vm, listener);
        removeEventListener(elm, type, wrappedListener, options);
    },

    hasAttribute(name: string): boolean {
        const {
            elm,
            renderer: { getAttribute },
        } = getAssociatedVM(this);
        return !isNull(getAttribute(elm, name));
    },

    hasAttributeNS(namespace: string | null, name: string): boolean {
        const {
            elm,
            renderer: { getAttribute },
        } = getAssociatedVM(this);
        return !isNull(getAttribute(elm, name, namespace));
    },

    removeAttribute(name: string): void {
        const {
            elm,
            renderer: { removeAttribute },
        } = getAssociatedVM(this);

        unlockAttribute(elm, name);
        removeAttribute(elm, name);
        lockAttribute(elm, name);
    },

    removeAttributeNS(namespace: string | null, name: string) {
        const {
            elm,
            renderer: { removeAttribute },
        } = getAssociatedVM(this);

        unlockAttribute(elm, name);
        removeAttribute(elm, name, namespace);
        lockAttribute(elm, name);
    },

    getAttribute(name: string): string | null {
        const {
            elm,
            renderer: { getAttribute },
        } = getAssociatedVM(this);
        return getAttribute(elm, name);
    },

    getAttributeNS(namespace: string | null, name: string): string | null {
        const {
            elm,
            renderer: { getAttribute },
        } = getAssociatedVM(this);
        return getAttribute(elm, name, namespace);
    },

    setAttribute(name: string, value: string): void {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { setAttribute },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            assert.isFalse(
                isBeingConstructed(vm),
                `Failed to construct '${getComponentTag(vm)}': The result must not have attributes.`
            );
        }

        unlockAttribute(elm, name);
        setAttribute(elm, name, value);
        lockAttribute(elm, name);
    },

    setAttributeNS(namespace: string | null, name: string, value: string): void {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { setAttribute },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            assert.isFalse(
                isBeingConstructed(vm),
                `Failed to construct '${getComponentTag(vm)}': The result must not have attributes.`
            );
        }

        unlockAttribute(elm, name);
        setAttribute(elm, name, value, namespace);
        lockAttribute(elm, name);
    },

    getBoundingClientRect(): ClientRect {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { getBoundingClientRect },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            assert.isFalse(
                isBeingConstructed(vm),
                `this.getBoundingClientRect() should not be called during the construction of the custom element for ${getComponentTag(
                    vm
                )} because the element is not yet in the DOM, instead, you can use it in one of the available life-cycle hooks.`
            );
        }

        return getBoundingClientRect(elm);
    },

    querySelector(selectors: string): Element | undefined {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { querySelector },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            assert.isFalse(
                isBeingConstructed(vm),
                `this.querySelector() cannot be called during the construction of the custom element for ${getComponentTag(
                    vm
                )} because no children has been added to this element yet.`
            );
        }

        return querySelector(elm, selectors) as Element | undefined;
    },

    querySelectorAll(selectors: string): NodeList {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { querySelectorAll },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            assert.isFalse(
                isBeingConstructed(vm),
                `this.querySelectorAll() cannot be called during the construction of the custom element for ${getComponentTag(
                    vm
                )} because no children has been added to this element yet.`
            );
        }

        return querySelectorAll(elm, selectors);
    },

    getElementsByTagName(tagNameOrWildCard: string): HTMLCollection {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { getElementsByTagName },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            assert.isFalse(
                isBeingConstructed(vm),
                `this.getElementsByTagName() cannot be called during the construction of the custom element for ${getComponentTag(
                    vm
                )} because no children has been added to this element yet.`
            );
        }

        return getElementsByTagName(elm, tagNameOrWildCard);
    },

    getElementsByClassName(names: string): HTMLCollection {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { getElementsByClassName },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            assert.isFalse(
                isBeingConstructed(vm),
                `this.getElementsByClassName() cannot be called during the construction of the custom element for ${getComponentTag(
                    vm
                )} because no children has been added to this element yet.`
            );
        }

        return getElementsByClassName(elm, names);
    },

    get isConnected(): boolean {
        const {
            elm,
            renderer: { isConnected },
        } = getAssociatedVM(this);
        return isConnected(elm);
    },

    get classList(): DOMTokenList {
        const vm = getAssociatedVM(this);
        const {
            elm,
            renderer: { getClassList },
        } = vm;

        if (process.env.NODE_ENV !== 'production') {
            // TODO [#1290]: this still fails in dev but works in production, eventually, we should
            // just throw in all modes
            assert.isFalse(
                isBeingConstructed(vm),
                `Failed to construct ${vm}: The result must not have attributes. Adding or tampering with classname in constructor is not allowed in a web component, use connectedCallback() instead.`
            );
        }

        return getClassList(elm);
    },

    get template(): ShadowRoot {
        const vm = getAssociatedVM(this);
        return vm.cmpRoot;
    },

    get shadowRoot(): null {
        // From within the component instance, the shadowRoot is always reported as "closed".
        // Authors should rely on this.template instead.
        return null;
    },

    render(): Template {
        const vm = getAssociatedVM(this);
        return vm.def.template;
    },

    toString(): string {
        const vm = getAssociatedVM(this);
        return `[object ${vm.def.name}]`;
    },
};

export const lightningBasedDescriptors: PropertyDescriptorMap = create(null);
for (const propName in HTMLElementOriginalDescriptors) {
    lightningBasedDescriptors[propName] = createBridgeToElementDescriptor(
        propName,
        HTMLElementOriginalDescriptors[propName]
    );
}

defineProperties(BaseLightningElementConstructor.prototype, lightningBasedDescriptors);

defineProperty(BaseLightningElementConstructor, 'CustomElementConstructor', {
    get() {
        // If required, a runtime-specific implementation must be defined.
        throw new ReferenceError('The current runtime does not support CustomElementConstructor.');
    },
    configurable: true,
});

if (process.env.NODE_ENV !== 'production') {
    patchLightningElementPrototypeWithRestrictions(BaseLightningElementConstructor.prototype);
}

// @ts-ignore
export const BaseLightningElement: LightningElementConstructor = BaseLightningElementConstructor as unknown;
