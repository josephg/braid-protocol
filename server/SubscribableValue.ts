import { ClientRequest, ServerResponse } from "http";
import { writable, WritableStore } from "./WritableStore";
import stream, { StringLike, BraidStream } from "./server";

export class SubscribableValue<T> {
  store: WritableStore<T>;
  streams: Set<BraidStream>;

  constructor(initialValue: T) {
    this.store = writable(initialValue);
    this.streams = new Set();

    this.connectStoreToStreams();
  }

  connectStoreToStreams() {
    this.store.subscribe((value) => {
      for (const stream of Object.values(this.streams)) {
        const currentValue = JSON.stringify(value);
        stream.append(currentValue);
      }
    });
  }

  addStream(res: ServerResponse, initialValue: StringLike) {
    const newStream = stream(res, {
      initialValue,
      contentType: "application/json",
      onclose: () => {
        if (this.streams.has(newStream as BraidStream)) {
          this.streams.delete(newStream as BraidStream);
        } else {
          console.warn("couldn't delete stream", newStream);
        }
      },
    });
    if (newStream) {
      this.streams.add(newStream);
    }
  }

  respond(req: ClientRequest, res: ServerResponse) {
    const currentValue = JSON.stringify(this.store.get());

    if (req.getHeader("subscribe") === "keep-alive") {
      this.addStream(res, currentValue);
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(currentValue);
    }
  }
}
