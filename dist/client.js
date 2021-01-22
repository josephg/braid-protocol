"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listenRaw = void 0;
require("isomorphic-fetch");
const ministreamiterator_1 = __importDefault(require("ministreamiterator"));
const merge = (value, patchType, patch) => {
    switch (patchType) {
        case 'snapshot': return patch;
        case 'merge-keys': {
            // This just merges the two objects together.
            return { ...value, ...patch };
        }
        default: {
            throw Error('Unknown patch type: ' + patchType);
            // return patch
        }
    }
};
const splitOnce = (s, sep) => {
    const pos = s.search(sep);
    if (pos < 0)
        return null;
    else {
        const remainder = s.slice(pos);
        // Figure out the length of the separator using the regular expression
        const sepLen = typeof sep === 'string' ? sep.length : remainder.match(sep)[0].length;
        return [
            s.slice(0, pos),
            remainder.slice(sepLen)
        ];
    }
};
async function* readHTTPChunks(res) {
    let state = 0 /* Headers */;
    let buffer = '';
    let header = null;
    function* append(s) {
        buffer += s;
        while (true) { // Read as much as we can.
            if (state === 0 /* Headers */) {
                const headerData = splitOnce(buffer, /\r?\n\r?\n/);
                if (headerData == null)
                    break;
                else {
                    const headerStr = headerData[0];
                    header = Object.fromEntries(headerStr.split(/\r?\n/).map(entry => {
                        const kv = splitOnce(entry, ': ');
                        if (kv == null)
                            throw Error('invalid HTTP header');
                        else
                            return [kv[0].toLowerCase(), kv[1]];
                    }));
                    // console.log('found header section', header)
                    state = 1 /* Data */;
                    buffer = headerData[1];
                }
            }
            else {
                if (header == null)
                    throw Error('invalid state');
                const contentLength = header['content-length'];
                if (contentLength == null)
                    throw Error('missing content-length');
                const contentLengthNum = parseInt(contentLength);
                if (isNaN(contentLengthNum))
                    throw Error('invalid content-length');
                if (buffer.length < contentLengthNum)
                    break;
                else {
                    const data = buffer.slice(0, contentLengthNum);
                    // console.log('got data', data)
                    yield { header, data };
                    buffer = buffer.slice(contentLengthNum);
                    header = null;
                    state = 0 /* Headers */;
                }
            }
        }
    }
    // Apparently node-fetch doesn't implement the WhatWG's stream protocol for
    // some reason. Instead it shows up as a nodejs stream.
    if (res.body && res.body[Symbol.asyncIterator] != null) {
        // We're in nodejs land, and the body is a nodejs stream object.
        const body = res.body;
        for await (const item of body) {
            yield* append(new TextDecoder('utf-8').decode(item));
        }
    }
    else {
        // We're in browser land and we can get a ReadableStream
        const reader = res.body.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (!done) {
                yield* append(new TextDecoder('utf-8').decode(value));
            }
            else {
                break;
            }
        }
    }
}
function listenRaw(url, opts = {}) {
    console.log('listen', url);
    const values = ministreamiterator_1.default();
    (async () => {
        const res = await fetch(url, {
            // url,
            headers: {
                'accept-patch': 'merge-object',
                'subscribe': 'keep-alive'
            },
        });
        for await (const { header, data: patch } of readHTTPChunks(res)) {
            // console.log('hd', header, data)
            values.append({ header, patch });
        }
    })();
    return values.iter;
}
exports.listenRaw = listenRaw;
async function* listen(url, opts = {}) {
    let value;
    let patchType = 'snapshot';
    for await (const { header, patch } of listenRaw(url, opts)) {
        if (header['patch-type'])
            patchType = header['patch-type'];
        value = merge(value, patchType, patch);
        yield { value, header, patch };
    }
}
exports.default = listen;
//# sourceMappingURL=client.js.map