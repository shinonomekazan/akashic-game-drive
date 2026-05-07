import * as agv from "@akashic/akashic-gameview";
import * as agvWeb from "@akashic/akashic-gameview-web";

export class ContentLoadedEvent extends Event {
	constructor() {
		super("loaded");
	}
}

export class Controller extends EventTarget {
	content?: agvWeb.GameContent;

	alive: boolean;

	gameview?: agvWeb.AkashicGameView;

	container?: HTMLElement;

	retryDelayTimer?: number;

	contentWidth: number;

	contentHeight: number;

	playerId: string;

	constructor(playerId: string) {
		super();
		this.playerId = playerId;
		this.content = undefined;
		this.gameview = undefined;
		this.alive = false;
		this.retryDelayTimer = undefined;
		this.container = undefined;
		this.contentWidth = 1;
		this.contentHeight = 1;
	}

	handleLoad() {
		const gameDriver = this.content!.getGameDriver();
		if (gameDriver == null || gameDriver._platform == null) {
			console.error("invalid gameDriver", gameDriver);
			return;
		}
		/*gameDriver._platform.sendToExternal = (playId: string, data: any) => {
			this.handleSendToExternal(data);
		};*/
		this.alive = true;
		this.dispatchEvent(new ContentLoadedEvent());
	}

	handleError(error: Error) {
		this.dispatchEvent(
			new ErrorEvent("error", {
				error,
				message: error.message,
			}),
		);
	}

	isAlive() {
		return this.alive;
	}

	generateAgv(container: HTMLElement, width: number, height: number) {
		this.container = container;
		this.contentWidth = width;
		this.contentHeight = height;
		const gameview = new agvWeb.AkashicGameView({
			container,
			width,
			height,
			untrustedFrameUrl: "",
			trustedChildOrigin: /.*/,
		});
		this.gameview = gameview;
		return gameview;
	}

	stop() {
		if (this.gameview == null) {
			throw new Error("gameview not generated yet");
		}
		if (this.content != null) {
			this.gameview.removeContent(this.content);
			this.content = undefined;
		}
	}

	start(contentUrl: string) {
		if (this.gameview == null) {
			throw new Error("gameview not generated yet");
		}
		if (this.content != null) {
			this.stop();
		}
		const playConfig: agv.PlayConfig = {
			playId: "dummy",
			executionMode: agv.ExecutionMode.Active,
		};
		const gameContentConfig: agv.GameConfig = {
			contentUrl: contentUrl,
			player: {
				id: this.playerId,
			},
			playConfig,
			zIndex: 1,
			contentLayout: {
				backgroundColor: "transparent",
				horizontalAlignment: agv.HorizontalAlignment.Left,
				verticalAlignment: agv.VerticalAlignment.Top,
				scaleMode: agv.ScaleMode.Fill,
				passthroughEvent: true,
			},
		};
		const content = new agvWeb.GameContent(gameContentConfig);
		this.gameview.addContent(content);

		content.addErrorListener({
			onError: (e) => {
				this.handleError(e);
			},
		});

		content.addContentLoadListener({
			onLoad: () => {
				this.handleLoad();
				resizer();
			},
		});

		const aspectRatio = this.contentHeight / this.contentWidth;
		const getClientWidth = () => {
			const width = this.container!.clientWidth;
			if (document.documentElement.clientHeight < width * aspectRatio) {
				return document.documentElement.clientHeight / aspectRatio;
			}
			return this.container!.clientWidth;
		};
		const getClientHeight = () => getClientWidth() * (this.contentHeight / this.contentWidth);
		const resizer = () => {
			const w = getClientWidth();
			const h = getClientHeight();
			if (this.contentWidth < w && this.contentHeight < h) {
				this.gameview!.setViewSize(this.container!.clientWidth, this.contentHeight);
				content.setContentArea({
					x: (this.container!.clientWidth - this.contentWidth) / 2,
					y: 0,
					width: this.contentWidth,
					height: this.contentHeight,
				});
				return;
			}
			this.gameview!.setViewSize(this.container!.clientWidth, h);
			content.setContentArea({
				x: (this.container!.clientWidth - w) / 2,
				y: 0,
				width: w,
				height: h,
			});
		};
		window.addEventListener("resize", resizer);

		this.content = content;
		return content;
	}

	sendMessageEvent(data: object) {
		if (this.content == null) {
			console.error("コンテンツが無い間にイベント送信が行われました", data);
			throw new Error("コンテンツが無い間にイベント送信が行われました");
		}
		const type = (data as any).type as string;
		if (type === "move" || type === "stop") {
			// 多いのでログ出力しない
		} else {
			console.log("sendMessageEvent:", data);
		}
		this.content.sendEvents([[32, null, this.playerId, data]]);
	}
}
