import 'isomorphic-fetch';
export interface StateClientOptions {
}
export declare function listenRaw(url: string, opts?: StateClientOptions): import("ministreamiterator").AsyncIterableIteratorWithRet<{
    header: Record<string, string>;
    patch: any;
}>;
export default function listen(url: string, opts?: StateClientOptions): AsyncGenerator<{
    value: any;
    header: Record<string, string>;
    patch: any;
}, void, unknown>;
