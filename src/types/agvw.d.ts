interface Agv {
	AkashicGameView: typeof AkashicGameView;
	GameContent: typeof GameContent;
	ExecutionMode: typeof ExecutionMode;
}

interface AkashicGameViewParameterObject {
	container: HTMLElement; //コンテンツを表示する HTMLELement
	width: number; //GameViewの幅
	height: number; //GameViewの高さ
}

interface PlayConfig {
	playId: string; //ゲームプレイを識別する値 (g.game.playId に反映)
	executionMode: Agv.ExecutionMode; //実行モード
	playlogServerUrl?: string; //マルチプレイの通信路サーバの URL
	playToken?: string; //マルチプレイの通信路サーバに引き渡すトークン
	/*replayData?: //リプレイ情報
	replayTargetTime?:*/ //リプレイ再生時、再生時刻 (ゲーム開始からの経過ミリ秒) を得るために呼び出されるコールバック関数
}

interface GameConfig {
	contentUrl: string; //content.jsonのURL
	player: { id: string }; //プレーヤー情報 idはこのコンテンツを実行するプレイヤーのID (g.game.selfId に反映)
	playConfig: PlayConfig; //プレイ情報 (プレイID, 実行モード, プレイログサーバURL, プレイトークン)
	/*contentArea?: //(省略可) ゲームの表示領域。省略すると領域全体の大きさ
	initialEvents?: //(省略可) 起動時に差し込むイベント
	audioPdiHandlers?:*/ //(省略可) オーディオ処理を差し替えるための場合のハンドラ
}

interface ExecutionMode {
	Active: unknown; //通信が必要ない (スタンドアロンで実行する) 場合
	Passive: unknown; //Akashic System を使ったマルチプレイの場合
	Replay: unknown; //Akashic System を使って過去のプレイの再現 (リプレイ) を視聴する場合
}

declare class AkashicGameView {
	constructor(param: AkashicGameViewParameterObject); //(コンストラクタ) コンテンツの表示領域を確保して初期化する。

	addContent(content: GameContent): void; //コンテンツを追加し、ゲームの実行を開始する。
	removeContent(Content): void; //コンテンツを削除する。
	removeAllContents(): void; //すべてのコンテンツを削除する。
	setViewSize(width: number, height: number): void; //表示領域の大きさを変更する。
	getViewSize(): { width: number; height: number }; //表示領域の大きさを取得する。
	registerExternalPlugin(ExternalPlugin): void; //ゲームが利用可能なプラグインを登録する。
	getGameViewSharedObject(): GameViewSharedObject; //GameViewの共有情報を取得する。
	destroy(): void; //GameViewを破棄する。(GameView生成時にSharedObjectを省略した場合、destroyと同時にsharedObjectも破棄される点に注意してください。)
	destroyed(): boolean; //GameViewが破棄されているかを取得する。
}

declare class GameContent {
	constructor(param: GameConfig); //(コンストラクタ) ゲームを作成する。実行は GameView に配置したときに開始する。

	addErrorListener(ErrorListener); //発生したエラーを通知するリスナを指定する。
	addContentLoadListener(ContentLoadListener); //コンテンツの実行開始を通知するリスナを指定する。
	setContentArea(ContentArea); //コンテンツの表示領域を設定する。
	getContentArea(); //コンテンツの表示領域を取得する。
	hide(); //非表示にする。
	show(); //表示する。
	getGame(); //akashic-engine のインスタンスを取得する。
	sendEvents(events: any[]); //ゲームにイベントを送信する。
	dumpPlaylog(); //スタンドアロン実行の場合、プレイログをダンプする。
	replay(DumpedPlaylog); //プレイログをもとにプレイを再現する。
	getGameContentSize(); //ゲームコンテンツの game.width, game.height を取得する。
	setGameContentSize(GameContenSize); //ゲームコンテンツの game.width, game.height を設定する。
	getMasterVolume(); //ゲームコンテンツのマスター音量を取得する。
	setMasterVolume(volume); //ゲームコンテンツのマスター音量を設定する。
	getExecutionMode(); //ゲームコンテンツの実行モードを取得する。
	setExecutionMode(mode); //ゲームコンテンツの実行モードを設定する。
	getReplayTargetTimeFunc(); //リプレイ時の目標時刻を返す関数を取得する。
	setReplayTargetTimeFunc(func); //リプレイ時の目標時刻を返す関数を設定する。
	getReplayOriginDate(); //リプレイの基準日時を取得する。
	setReplayOriginDate(); //リプレイの基準日時を設定する。
	getPlayOriginDate(); //ゲームのプレイ開始日時を取得する。
	getReplayOriginDateOffset(); //リプレイデータのプレイログに記録されている開始時刻と目標時刻関数との差を取得する
	setTabIndex(tabIndex); //ゲームコンテンツの要素にtabIndexを付与する。
	getTabIndex();
}

declare global {
	interface Window {
		require(moduleName: "@akashic/akashic-gameview-web"): Agv;
	}
}

export {};
