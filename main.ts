import * as path from "https://deno.land/std@0.205.0/path/mod.ts";

class CssFileWatcher {
  subscriber: ((content: string) => void)[];
  lastModified: number;
  constructor(private path: string) {
    this.path = path;
    this.subscriber = [];
    this.lastModified = 0;
  }
  subscribe(cb: (content: string) => void) {
    this.subscriber.push(cb);
    if (this.subscriber.length === 1) {
      this.watch();
    }
  }
  async watch() {
    while (true) {
      const watcher = Deno.watchFs(this.path);
      for await (const event of watcher) {
        if (event.kind == "remove") {
          break;
        }
        const now = performance.now();
        if (now - this.lastModified < 500) {
          break;
        }
        this.lastModified = now;
        try {
          const content = await Deno.readTextFile(this.path);
          console.log("File changed");
          this.subscriber.forEach((cb) => cb(content));
        } catch {
          console.error("Failed to read file");
        }
      }
    }
  }
  async read() {
    const content = await Deno.readTextFile(this.path);
    return content;
  }
}

main();

async function main() {
  const cssPathArg = Deno.args[0];
  if (!cssPathArg) {
    console.error("Please provide css path");
    Deno.exit(1);
  }

  const cssPath = path.resolve(cssPathArg);
  const clientScriptUrl = import.meta.resolve("./client.js");
  const clientScript = await Deno.readTextFile(clientScriptUrl);

  const watcher = new CssFileWatcher(cssPath);

  Deno.serve({
    port: 3010,
    handler: async (request) => {
      if (request.headers.get("upgrade") === "websocket") {
        const { socket, response } = Deno.upgradeWebSocket(request);

        socket.send(
          JSON.stringify({ type: "css", content: await watcher.read() }),
        );
        watcher.subscribe((content) => {
          socket.send(JSON.stringify({ type: "css", content }));
        });

        return response;
      } else {
        const hostname = request.headers.get("host") || "localhost";
        const script = clientScript.replace(
          "{{wsUrl}}",
          `ws://${hostname}/ws`,
        );
        // return `text/javascript`
        return new Response(script, {
          headers: {
            "content-type": "text/javascript",
          },
        });
      }
    },
  });
}
