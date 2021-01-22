/// <reference types="node" />
import { ServerResponse } from "http";
interface StateServerOpts<T> {
    /**
     * Optional headers from request, so we can parse out requested patch type
     * and requested version
     */
    initialVerson?: string;
    initialValue?: T;
    /** The type of the referred content (content-type if you issued a GET on the resource) */
    contentType?: string;
    /** Defaults to snapshot - aka, each patch will contain a new copy of the data. */
    patchType?: 'snapshot' | 'merge-object' | string;
    httpHeaders?: {
        [k: string]: string | any;
    };
    /**
     * Optional event handler called when the peer disconnects
     */
    onclose?: () => void;
    /**
     * Send a heartbeat message every (seconds). Defaults to every 30 seconds.
     * This is needed to avoid some browsers closing the connection automatically
     * after a 1 minute timeout.
     *
     * Set to `null` to disable heartbeat messages.
     */
    heartbeatSecs?: number | null;
}
export interface MaybeFlushable {
    flush?: () => void;
}
interface StateMessage {
    headers?: {
        [k: string]: string | any;
    };
    data: string | Buffer;
    version?: string;
}
export default function stream<T>(res: ServerResponse & MaybeFlushable, opts?: StateServerOpts<T>): {
    stream: import("ministreamiterator").Stream<StateMessage>;
    append: (patch: any, version?: string | undefined) => void;
};
export {};
