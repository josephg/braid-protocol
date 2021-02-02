/**
 * Tiny state management library inspired by Svelte stores.
 * Thanks to Anthony Penna for writable-store; MIT Licensed.
 *
 * See https://github.com/anthonypenna/writable-store
 */

type WritableStoreSubscription = {
  unsubscribe(): void;
};

export declare type WritableStore<T extends unknown> = {
  get(): T | null;
  set(callback: (state: T) => T): void;
  subscribe(callback: (state: T) => void): WritableStoreSubscription;
};

export function writable<T extends unknown>(state: T): WritableStore<T> {
  let writableState: T | null = state;
  let subscribers: Array<(state: T) => void> | null = [];
  return {
    get() {
      return writableState;
    },
    set(callback) {
      writableState = callback.call(null, writableState as T);
      subscribers!.forEach((subscriber) => subscriber(writableState as T));
    },
    subscribe(callback) {
      subscribers!.push(callback);
      return {
        unsubscribe() {
          subscribers = subscribers
            ? subscribers.filter((subscriber) => subscriber !== callback)
            : [];
        },
      };
    },
  };
}
