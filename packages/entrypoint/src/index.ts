const log = console.log.bind(console, "\x1b[32m [ecv:top]");

// on load, we copy pathname and search params to the iframe
const iframe = document.getElementById("frame")! as HTMLIFrameElement;
const url = new URL(iframe.getAttribute("src")!);
const { hostname, pathname, search } = window.location;

url.pathname = pathname;
url.search = search;

// prefix of the hostname is passed to `explorer` search param
// @see vscode-host/src/deth/commands/ethViewerCommands.ts
if (hostname.endsWith(".deth.net") && !url.searchParams.get("explorer")) {
  url.searchParams.set("explorer", hostname.slice(0, -9));
}

log("setting iframe src:", url.href);
iframe.setAttribute("src", url.href);
// @todo in the future, we should also listen for postMessage events when
// the ECV app inside of the iframe updates the URL, but it's not happening
// right now

void (function exposeFunctions() {
  let channel: MessageChannel;

  const exposedFunctions = {
    /**
     * see VSCode's BrowserKeyboardMapperFactoryBase._getBrowserKeyMapping
     */
    async getLayoutMap() {
      const keyboard = (navigator as any).keyboard as NavigatorKeyboard | null;

      if (!keyboard) return;

      const keyboardLayoutMap = await keyboard.getLayoutMap();
      // KeyboardLayoutMap can't be cloned, so it can't be sent with postMessage
      return new Map(keyboardLayoutMap);
    },
  };

  type ExposedFunctionCall = {
    type: "getLayoutMap";
    args: Parameters<typeof exposedFunctions["getLayoutMap"]>;
  };

  iframe.addEventListener("load", function onLoad() {
    iframe.removeEventListener("load", onLoad);

    channel = new MessageChannel();
    const iframeWindow = iframe.contentWindow!;

    log("iframe loaded, passing channel port");
    // The code responsible for interaction with this port lies in
    // vscode-host/src/deth/in-iframe.ts
    iframeWindow.postMessage({ type: "port-open" }, "*", [channel.port2]);

    channel.port1.start();
    channel.port1.onmessage = (event) => {
      log("received message from iframe:", event.data);

      if (event.data && "type" in event.data) {
        const data = event.data as ExposedFunctionCall;
        void exposedFunctions[data.type](...data.args).then((res) => {
          log(`returned from ${data.type}:`, res, event.data);

          channel.port1.postMessage({ type: "result", fun: data.type, res });
        });
      }
    };
  });
})();

interface NavigatorKeyboard {
  getLayoutMap(): Promise<KeyboardLayoutMap>;
}
/** https://developer.mozilla.org/en-US/docs/Web/API/KeyboardLayoutMap */
interface KeyboardLayoutMap
  extends Iterable<
    [label: string, key: string] /* example: ['BracketRight', ']'] */
  > {}
interface KeyboardMapping
  extends Record<
    string,
    {
      value: string;
      withShift: string;
      withAltGr: string;
      withShiftAltGr: string;
    }
  > {}
