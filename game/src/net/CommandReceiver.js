/**
 * CommandReceiver.js
 * WebSocket 客户端，接收 AI 中枢指令
 * 连接失败时安静地降级（游戏仍然通过鼠标指令可玩）
 */
export class CommandReceiver {
  constructor(url, onCommand) {
    this.url = url;
    this.onCommand = onCommand;
    this.ws = null;
    this._connect();
  }

  _connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => console.log('[WS] AI Hub connected');
      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'ping') return;
          this.onCommand(data.type, data);
        } catch (e) {
          console.warn('[WS] parse error', e);
        }
      };
      this.ws.onclose = () => {
        console.log('[WS] AI Hub disconnected — retrying in 3s (mouse fallback active)');
        setTimeout(() => this._connect(), 3000);
      };
      this.ws.onerror = () => {};
    } catch (e) {
      console.log('[WS] WebSocket not available');
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
