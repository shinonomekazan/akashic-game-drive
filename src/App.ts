import "bootstrap";
import { Modal } from "bootstrap";
import "./css/bootstrap.min.css";
import { connectAuthEmulator } from "firebase/auth";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import type { AppState, ContentRecord, FeedbackRecord, UserProfile } from "./types";
import * as utils from "./utils";
import { getUser, listFeedback, listMyFeedbacks } from "./resolvers";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectStorageEmulator, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Client } from "./api/client";
import type { UpdateContentInput } from "./api/contents";
import { createContent, createContentUploadUrl, getContentById, listMyContents, updateContent } from "./api/contents";
import { createFeedback, createUser, getUserById, listUserContents } from "./api/users";
import { loadContentFiles } from "./downloader";
import { createReport } from "./api/reports";

export class App {
	firebase: FirebaseInstance;
	config: AppConfig;
	apiClient: Client;
	rootEl: HTMLElement;
	toastEl: HTMLElement;
	state: AppState;

	constructor(config: AppConfig = appConfig as AppConfig) {
		this.config = config;
		this.firebase = initializeFirebase(this.config.firebaseConfig);
		this.apiClient = new Client({
			apiConfig: this.config.apiConfig,
			useEmulator: utils.isDebugMode(),
		});
		this.rootEl = utils.qsStrict<HTMLElement>("#app-root");
		this.toastEl = utils.qsStrict<HTMLElement>("#toast");
		this.state = {
			route: utils.parseRoute(),
			user: null,
			loading: true,
			profile: null,
			profileLoaded: false,
			profileLoading: false,
			needsProfile: false,
			contents: [],
			contentsLoaded: false,
			contentsLoading: false,
			userPageId: null,
			userPageProfile: null,
			userPageProfileLoaded: false,
			userPageProfileLoading: false,
			userPageContents: [],
			userPageContentsLoaded: false,
			userPageContentsLoading: false,
			contentViewId: null,
			contentView: null,
			contentViewLoaded: false,
			contentViewLoading: false,
			contentViewOwnerId: null,
			contentViewOwner: null,
			contentViewOwnerLoaded: false,
			contentViewOwnerLoading: false,
			feedbacks: [],
			myFeedbacks: [],
			myFeedbacksLoaded: false,
			feedbacksLimit: null,
			myFeedbacksLimit: null,
			feedbackUsers: {},
			feedbackContentTitles: {},
			myFeedbackDisplayCount: 10,
			mySentFeedbackDisplayCount: 10,
			refreshMyFeedbacks: false,
		};
		this.connectEmulatorIfDebug();
	}

	async main() {
		watchAuthChanges(this.firebase, async (user) => {
			this.apiClient.idTokenFunction = user ? () => user.getIdToken() : undefined;
			this.state = {
				...this.state,
				user,
				loading: false,
				profile: null,
				profileLoaded: false,
				profileLoading: false,
				needsProfile: false,
				contents: [],
				contentsLoaded: false,
				contentsLoading: false,
				userPageId: null,
				userPageProfile: null,
				userPageProfileLoaded: false,
				userPageProfileLoading: false,
				userPageContents: [],
				userPageContentsLoaded: false,
				userPageContentsLoading: false,
				contentViewId: null,
				contentView: null,
				contentViewLoaded: false,
				contentViewLoading: false,
				contentViewOwnerId: null,
				contentViewOwner: null,
				contentViewOwnerLoaded: false,
				contentViewOwnerLoading: false,
				feedbacks: [],
				myFeedbacks: [],
				myFeedbacksLoaded: false,
				feedbacksLimit: null,
				myFeedbacksLimit: null,
				feedbackUsers: {},
				feedbackContentTitles: {},
				myFeedbackDisplayCount: 10,
				mySentFeedbackDisplayCount: 10,
				refreshMyFeedbacks: false,
			};
			await this.render();
		});

		window.addEventListener("popstate", async () => {
			const nextRoute = utils.parseRoute();
			const shouldRefreshMy = nextRoute.name === "my" && this.state.route.name !== "my";
			this.state = {
				...this.state,
				route: nextRoute,
				refreshMyFeedbacks: shouldRefreshMy,
			};
			await this.render();
		});
		this.activateSplashScreen();
		await this.render();
	}

	activateSplashScreen() {
		const splashScreen = sessionStorage.getItem("akashic-game-drive-splash-screen");
		if (splashScreen != null) return;
		const element = document.createElement("div");
		document.body.style.overflowY = "hidden";
		element.classList.add("akashic-game-drive-splash");
		const image = new Image();
		image.addEventListener(
			"load",
			async () => {
				image.classList.add("fade-in");
				await utils.wait(1000);
				await utils.wait(1000);
				element.classList.add("fade-out");
				await utils.wait(1000);
				document.body.style.overflowY = "auto";
				sessionStorage.setItem("akashic-game-drive-splash-screen", "shown");
			},
			{ once: true },
		);
		image.src = "/image/logo.png";
		image.alt = "ニコ生ゲーム広場（仮）";
		element.appendChild(image);
		document.body.appendChild(element);
	}

	connectEmulatorIfDebug() {
		if (!utils.isDebugMode()) return;
		connectAuthEmulator(this.firebase.auth, "http://localhost:9099");
		connectFirestoreEmulator(this.firebase.firestore, "localhost", 8080);
		connectStorageEmulator(this.firebase.storage, "localhost", 9199);
	}

	async render() {
		if (this.state.loading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		switch (this.state.route.name) {
			case "login":
				this.renderLogin();
				break;
			case "my-edit":
				await this.renderMyEdit();
				break;
			case "my-contents":
				await this.renderMyContents();
				break;
			case "my-feedbacks":
				await this.renderMyFeedbacks();
				break;
			case "my-myFeedbacks":
				await this.renderMySentFeedbacks();
				break;
			case "content-edit":
				await this.renderContentEdit();
				break;
			case "content-view":
				await this.renderContentView();
				break;
			case "my":
				await this.renderMy();
				break;
			case "user":
				await this.renderUserPage();
				break;
			case "top":
			default:
				this.redirectFromRoot();
				break;
		}
	}

	redirectFromRoot() {
		if (this.state.user) {
			utils.navigateTo("/my");
			return;
		}
		utils.navigateTo("/login");
	}

	async renderMy() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup();
			return;
		}

		if (this.state.contentsLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.contentsLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMyContents();
			await this.loadMyFeedback(5);
			await this.loadMySentFeedback(5);
			await this.render();
			return;
		}

		if (!this.state.myFeedbacksLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMySentFeedback(5);
			await this.render();
			return;
		}

		if (this.state.refreshMyFeedbacks) {
			await this.loadMyFeedback(5);
			await this.loadMySentFeedback(5);
			this.state = { ...this.state, refreshMyFeedbacks: false };
			await this.render();
			return;
		}

		if (this.state.feedbacksLimit !== 5 || this.state.myFeedbacksLimit !== 5) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMyFeedback(5);
			await this.loadMySentFeedback(5);
			await this.render();
			return;
		}

		this.renderMyProfile();
	}

	async renderMyFeedbacks() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading || this.state.contentsLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup();
			return;
		}

		if (!this.state.contentsLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMyContents();
			await this.loadMyFeedback();
			await this.render();
			return;
		}

		if (this.state.feedbacksLimit !== null) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMyFeedback();
			this.state = { ...this.state, myFeedbackDisplayCount: 10 };
			await this.render();
			return;
		}

		const name = this.state.profile?.name ?? "-";
		const safeName = utils.escapeHtml(name);
		const nameLinkHtml = `<a id="my-page-link" class="text-decoration-none text-reset" href="/my">${safeName}</a>`;
		const title = `${nameLinkHtml} もらったフィードバック`;
		const displayCount = Math.max(10, this.state.myFeedbackDisplayCount);
		const feedbackSummaryLimit = 64;
		const feedbackUsers = this.state.feedbackUsers;
		const contentTitleById = new Map(this.state.contents.map((content) => [content.id, content.title]));
		const feedbackItems = this.state.feedbacks
			.slice()
			.sort((a, b) => utils.getTimestampMillis(b.createdAt) - utils.getTimestampMillis(a.createdAt));
		const feedbackPreview = feedbackItems.slice(0, displayCount);
		const hasMore = feedbackItems.length > displayCount;
		const feedbackItemsHtml =
			feedbackPreview.length === 0
				? '<div class="agd-empty">フィードバックはまだありません。</div>'
				: `
					<div class="d-grid gap-3">
						${feedbackPreview
							.map((feedback) => {
								const titleText = utils.escapeHtml(feedback.title || "-");
								const detailText = feedback.detail.replace(/\s+/g, " ").trim();
								const summaryBase = detailText || "-";
								const summary =
									summaryBase.length > feedbackSummaryLimit
										? `${summaryBase.slice(0, feedbackSummaryLimit)}...`
										: summaryBase;
								const createdAtText = utils.formatTimestamp(feedback.createdAt);
								const contentTitle = feedback.contentId
									? (contentTitleById.get(feedback.contentId) ?? "")
									: "";
								const contentTitleHtml = contentTitle
									? `<div class="text-secondary small">${utils.escapeHtml(
											contentTitle,
										)} に対して</div>`
									: "";
								const senderProfile = feedbackUsers[feedback.senderId ?? ""];
								const avatarUrl = senderProfile?.photoURL
									? utils.escapeHtml(senderProfile.photoURL)
									: "/image/icon_default.png";
								return `
									<div class="d-flex gap-3 align-items-start">
										<img class="agd-feedback-avatar rounded" src="${avatarUrl}" alt="sender" />
										<div class="flex-grow-1">
											${contentTitleHtml}
											<div class="fw-semibold">
												<a class="text-decoration-none text-dark js-feedback-title" href="#" data-feedback-id="${utils.escapeHtml(
													feedback.id,
												)}" data-feedback-type="received">${titleText}</a>
											</div>
											<div class="text-secondary small">${utils.escapeHtml(summary)}</div>
											<div class="text-secondary small">作成日: ${createdAtText}</div>
										</div>
									</div>
								`;
							})
							.join("")}
					</div>
				`;
		const showMoreHtml = hasMore
			? `
				<div class="text-center mt-3">
					<button id="feedback-show-more" class="btn btn-link text-dark text-decoration-underline" type="button">もっと見る</button>
				</div>
			`
			: "";
		const feedbackModalHtml = `
			<div class="modal fade" id="feedback-modal" tabindex="-1" aria-hidden="true">
				<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
					<div class="modal-content">
						<div class="modal-header">
							<h5 class="modal-title" id="feedback-modal-title">フィードバック</h5>
							<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="閉じる"></button>
						</div>
						<div class="modal-body">
							<div class="text-secondary small mb-2" id="feedback-modal-date"></div>
							<div id="feedback-modal-detail" class="agd-description"></div>
						</div>
					</div>
				</div>
			</div>
		`;
		this.setContent(`
			<div class="agd-my-header">
				<div class="agd-user-name">${title}</div>
			</div>
			<div class="card shadow-sm">
				<div class="card-body">
					<div class="d-flex align-items-center justify-content-between mb-3">
						<h2 class="h6 mb-0">フィードバック一覧</h2>
					</div>
					${feedbackItemsHtml}
					${showMoreHtml}
				</div>
			</div>
			${feedbackModalHtml}
		`);

		this.bindFeedbackModal();
		const myPageLink = utils.qs<HTMLAnchorElement>("#my-page-link");
		if (myPageLink) {
			myPageLink.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo("/my");
			});
		}
		const showMoreBtn = utils.qs<HTMLButtonElement>("#feedback-show-more");
		if (showMoreBtn) {
			showMoreBtn.addEventListener("click", async () => {
				const nextCount = Math.min(this.state.myFeedbackDisplayCount + 10, this.state.feedbacks.length);
				this.state = { ...this.state, myFeedbackDisplayCount: nextCount };
				await this.render();
			});
		}
	}

	async renderMySentFeedbacks() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading || this.state.contentsLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup();
			return;
		}

		if (!this.state.contentsLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMyContents();
			await this.loadMySentFeedback();
			await this.render();
			return;
		}

		if (!this.state.myFeedbacksLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMySentFeedback();
			await this.render();
			return;
		}

		if (this.state.myFeedbacksLimit !== null) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMySentFeedback();
			this.state = { ...this.state, mySentFeedbackDisplayCount: 10 };
			await this.render();
			return;
		}

		const name = this.state.profile?.name ?? "-";
		const safeName = utils.escapeHtml(name);
		const nameLinkHtml = `<a id="my-page-link" class="text-decoration-none text-reset" href="/my">${safeName}</a>`;
		const title = `${nameLinkHtml} 送ったフィードバック`;
		const displayCount = Math.max(10, this.state.mySentFeedbackDisplayCount);
		const feedbackSummaryLimit = 64;
		const feedbackUsers = this.state.feedbackUsers;
		const feedbackContentTitles = this.state.feedbackContentTitles;
		const feedbackItems = this.state.myFeedbacks
			.slice()
			.sort((a, b) => utils.getTimestampMillis(b.createdAt) - utils.getTimestampMillis(a.createdAt));
		const feedbackPreview = feedbackItems.slice(0, displayCount);
		const hasMore = feedbackItems.length > displayCount;
		const feedbackItemsHtml =
			feedbackPreview.length === 0
				? '<div class="agd-empty">送ったフィードバックはまだありません。</div>'
				: `
					<div class="d-grid gap-3">
						${feedbackPreview
							.map((feedback) => {
								const titleText = utils.escapeHtml(feedback.title || "-");
								const detailText = (feedback.detail ?? "").replace(/\s+/g, " ").trim();
								const summaryBase = detailText || "-";
								const summary =
									summaryBase.length > feedbackSummaryLimit
										? `${summaryBase.slice(0, feedbackSummaryLimit)}...`
										: summaryBase;
								const createdAtText = utils.formatTimestamp(feedback.createdAt);
								const contentTitle = feedback.contentId
									? (feedbackContentTitles[feedback.contentId] ?? "")
									: "";
								const contentTitleLabel = contentTitle || "コンテンツ";
								const contentHref = feedback.contentId
									? `/contents/${encodeURIComponent(feedback.contentId)}`
									: "";
								const contentTitleHtml = feedback.contentId
									? `<div class="text-secondary small"><a class="text-decoration-none text-secondary js-content-link" href="${utils.escapeHtml(
											contentHref,
										)}" data-content-id="${utils.escapeHtml(
											feedback.contentId,
										)}">${utils.escapeHtml(contentTitleLabel)}</a> に対して</div>`
									: "";
								const receiverProfile = feedbackUsers[feedback.receiverId];
								const avatarUrl = receiverProfile?.photoURL
									? utils.escapeHtml(receiverProfile.photoURL)
									: "/image/icon_default.png";
								const receiverHref = feedback.receiverId
									? `/users/${encodeURIComponent(feedback.receiverId)}`
									: "";
								const avatarHtml = receiverHref
									? `<a class="text-decoration-none js-user-link" href="${utils.escapeHtml(
											receiverHref,
										)}" data-user-id="${utils.escapeHtml(
											feedback.receiverId,
										)}"><img class="agd-feedback-avatar rounded" src="${avatarUrl}" alt="receiver" /></a>`
									: `<img class="agd-feedback-avatar rounded" src="${avatarUrl}" alt="receiver" />`;
								return `
									<div class="d-flex gap-3 align-items-start">
										${avatarHtml}
										<div class="flex-grow-1">
											${contentTitleHtml}
											<div class="fw-semibold">
												<a class="text-decoration-none text-dark js-feedback-title" href="#" data-feedback-id="${utils.escapeHtml(
													feedback.id,
												)}" data-feedback-type="sent">${titleText}</a>
											</div>
											<div class="text-secondary small">${utils.escapeHtml(summary)}</div>
											<div class="text-secondary small">作成日: ${createdAtText}</div>
										</div>
									</div>
								`;
							})
							.join("")}
					</div>
				`;
		const showMoreHtml = hasMore
			? `
				<div class="text-center mt-3">
					<button id="my-sent-feedback-show-more" class="btn btn-link text-dark text-decoration-underline" type="button">もっと見る</button>
				</div>
			`
			: "";
		const feedbackModalHtml = `
			<div class="modal fade" id="feedback-modal" tabindex="-1" aria-hidden="true">
				<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
					<div class="modal-content">
						<div class="modal-header">
							<h5 class="modal-title" id="feedback-modal-title">フィードバック</h5>
							<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="閉じる"></button>
						</div>
						<div class="modal-body">
							<div class="text-secondary small mb-2" id="feedback-modal-date"></div>
							<div id="feedback-modal-detail" class="agd-description"></div>
						</div>
					</div>
				</div>
			</div>
		`;
		this.setContent(`
			<div class="agd-my-header">
				<div class="agd-user-name">${title}</div>
			</div>
			<div class="card shadow-sm">
				<div class="card-body">
					<div class="d-flex align-items-center justify-content-between mb-3">
						<h2 class="h6 mb-0">送ったフィードバック一覧</h2>
					</div>
					${feedbackItemsHtml}
					${showMoreHtml}
				</div>
			</div>
			${feedbackModalHtml}
		`);

		this.bindFeedbackModal();
		const myPageLink = utils.qs<HTMLAnchorElement>("#my-page-link");
		if (myPageLink) {
			myPageLink.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo("/my");
			});
		}
		const showMoreBtn = utils.qs<HTMLButtonElement>("#my-sent-feedback-show-more");
		if (showMoreBtn) {
			showMoreBtn.addEventListener("click", async () => {
				const nextCount = Math.min(this.state.mySentFeedbackDisplayCount + 10, this.state.myFeedbacks.length);
				this.state = { ...this.state, mySentFeedbackDisplayCount: nextCount };
				await this.render();
			});
		}

		const userLinks = utils.qsStrictAll<HTMLAnchorElement>(this.rootEl, ".js-user-link");
		userLinks.forEach((link) => {
			const userId = link.dataset.userId;
			if (!userId) return;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo(`/users/${encodeURIComponent(userId)}`);
			});
		});

		const contentLinks = utils.qsStrictAll<HTMLAnchorElement>(this.rootEl, ".js-content-link");
		contentLinks.forEach((link) => {
			const contentId = link.dataset.contentId;
			if (!contentId) return;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo(`/contents/${encodeURIComponent(contentId)}`);
			});
		});
	}

	async renderUserPage() {
		const route = this.state.route;
		const userId = route.name === "user" ? route.userId : "";
		if (!userId) {
			utils.navigateTo("/");
			return;
		}

		if (this.state.userPageId !== userId) {
			this.state = {
				...this.state,
				userPageId: userId,
				userPageProfile: null,
				userPageProfileLoaded: false,
				userPageProfileLoading: false,
				userPageContents: [],
				userPageContentsLoaded: false,
				userPageContentsLoading: false,
			};
		}

		if (this.state.userPageProfileLoading || this.state.userPageContentsLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.userPageProfileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserPageProfile(userId);
			await this.render();
			return;
		}

		if (!this.state.userPageProfile) {
			this.setContent('<div class="text-center text-secondary">ユーザーが見つかりません。</div>');
			return;
		}

		if (!this.state.userPageContentsLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserPageContents(userId);
			await this.render();
			return;
		}

		const isOwnPage = this.state.user?.uid === userId;
		const isSignedIn = this.state.user !== null;
		this.renderMyContent(this.state.userPageProfile, this.state.userPageContents, {
			allowEdit: false,
			showActions: false,
			showCreate: false,
			nameLink: isOwnPage ? "/my" : null,
			showFeedbackForm: !isOwnPage && isSignedIn,
			showFeedbackLoginPrompt: !isOwnPage && !isSignedIn,
		});
	}

	async renderMyEdit() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		this.renderProfileSetup();
	}

	async renderMyContents() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup();
			return;
		}

		this.renderContentCreate();
	}

	async renderContentEdit() {
		const signedIn = this.state.user !== null;
		if (!signedIn) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.profileLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadUserProfile();
			await this.render();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup();
			return;
		}

		if (this.state.contentsLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.contentsLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadMyContents();
			await this.render();
			return;
		}

		const route = this.state.route;
		const contentId = route.name === "content-edit" ? route.contentId : "";
		const content = this.state.contents.find((item) => item.id === contentId);
		if (!content) {
			this.showToast("コンテンツが見つかりません", "error");
			utils.navigateTo("/my");
			return;
		}

		this.renderContentCreate(content);
	}

	async renderContentView() {
		const route = this.state.route;
		const contentId = route.name === "content-view" ? route.contentId : "";
		if (!contentId) {
			utils.navigateTo("/");
			return;
		}

		if (this.state.contentViewId !== contentId) {
			this.state = {
				...this.state,
				contentViewId: contentId,
				contentView: null,
				contentViewLoaded: false,
				contentViewLoading: false,
			};
		}

		if (this.state.contentViewLoading) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			return;
		}

		if (!this.state.contentViewLoaded) {
			this.setContent('<div class="text-center text-secondary">読み込み中...</div>');
			await this.loadContentView(contentId);
			await this.render();
			return;
		}

		if (!this.state.contentView) {
			this.setContent('<div class="text-center text-secondary">コンテンツが見つかりません。</div>');
			return;
		}

		const content = this.state.contentView;
		const ownerId = content.ownerId;
		if (this.state.contentViewOwnerId !== ownerId) {
			this.state = {
				...this.state,
				contentViewOwnerId: ownerId,
				contentViewOwner: null,
				contentViewOwnerLoaded: false,
				contentViewOwnerLoading: false,
			};
		}
		if (!this.state.contentViewOwnerLoaded && !this.state.contentViewOwnerLoading) {
			void this.loadContentViewOwner(ownerId);
		}

		const isOwnPage = this.state.user?.uid === ownerId;
		const isSignedIn = this.state.user !== null;
		this.renderContentDetail(content, this.state.contentViewOwner, {
			showFeedbackForm: !isOwnPage && isSignedIn,
			showFeedbackLoginPrompt: !isOwnPage && !isSignedIn,
			showReportForm: !isOwnPage && isSignedIn,
		});
	}

	async loadUserProfile() {
		const currentUser = this.state.user;
		if (!currentUser || this.state.profileLoading) {
			return;
		}
		this.state = { ...this.state, profileLoading: true };
		try {
			let profile = await getUser(this.firebase.firestore, currentUser.uid);
			if (!profile) {
				this.state = {
					...this.state,
					profile: null,
					profileLoaded: true,
					profileLoading: false,
					needsProfile: true,
				};
				return;
			}
			this.state = {
				...this.state,
				profile,
				profileLoaded: true,
				profileLoading: false,
				needsProfile: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				profileLoaded: true,
				profileLoading: false,
				needsProfile: false,
			};
			this.showToast((err as Error).message || "ユーザー情報の取得に失敗しました", "error");
		}
	}

	async loadMyContents() {
		const currentUser = this.state.user;
		if (!currentUser || this.state.contentsLoading) {
			return;
		}
		this.state = { ...this.state, contentsLoading: true };
		try {
			const response = await listMyContents(this.apiClient);
			const contents = response.data.contents ?? [];
			utils.sortContentsByCreatedAt(contents);
			this.state = {
				...this.state,
				contents,
				contentsLoaded: true,
				contentsLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				contentsLoaded: true,
				contentsLoading: false,
			};
			this.showToast((err as Error).message || "コンテンツの取得に失敗しました", "error");
		}
	}

	async loadMyFeedback(limitCount?: number) {
		const currentUser = this.state.user;
		if (!currentUser || this.state.contentsLoading) {
			return;
		}
		this.state = { ...this.state, contentsLoading: true };
		try {
			const feedbackDocs = await listFeedback(this.firebase.firestore, currentUser.uid, limitCount);
			const feedbacks = feedbackDocs.docs.map((doc) => utils.withId<FeedbackRecord>(doc));
			const senderIds = Array.from(
				new Set(
					feedbacks
						.map((feedback) => feedback.senderId)
						.filter((senderId): senderId is string => Boolean(senderId)),
				),
			);
			const feedbackUsers: Record<string, UserProfile | null> = {};
			await Promise.all(
				senderIds.map(async (senderId) => {
					try {
						feedbackUsers[senderId] = await getUser(this.firebase.firestore, senderId);
					} catch {
						feedbackUsers[senderId] = null;
					}
				}),
			);
			this.state = {
				...this.state,
				feedbacks,
				feedbacksLimit: limitCount ?? null,
				feedbackUsers: { ...this.state.feedbackUsers, ...feedbackUsers },
				contentsLoaded: true,
				contentsLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				feedbacksLimit: limitCount ?? null,
				contentsLoaded: true,
				contentsLoading: false,
			};
			this.showToast((err as Error).message || "フィードバックの取得に失敗しました", "error");
		}
	}

	async loadMySentFeedback(limitCount?: number) {
		const currentUser = this.state.user;
		if (!currentUser || this.state.contentsLoading) {
			return;
		}
		this.state = { ...this.state, contentsLoading: true };
		try {
			const feedbackDocs = await listMyFeedbacks(this.firebase.firestore, currentUser.uid, limitCount);
			const myFeedbacks = feedbackDocs.docs.map((doc) => utils.withId<FeedbackRecord>(doc));
			const receiverIds = Array.from(
				new Set(
					myFeedbacks
						.map((feedback) => feedback.receiverId)
						.filter((receiverId): receiverId is string => Boolean(receiverId)),
				),
			);
			const feedbackUsers: Record<string, UserProfile | null> = {};
			await Promise.all(
				receiverIds.map(async (receiverId) => {
					try {
						feedbackUsers[receiverId] = await getUser(this.firebase.firestore, receiverId);
					} catch {
						feedbackUsers[receiverId] = null;
					}
				}),
			);
			const contentIds = Array.from(
				new Set(
					myFeedbacks
						.map((feedback) => feedback.contentId)
						.filter((contentId): contentId is string => Boolean(contentId)),
				),
			);
			const feedbackContentTitles = { ...this.state.feedbackContentTitles };
			await Promise.all(
				contentIds.map(async (contentId) => {
					if (feedbackContentTitles[contentId]) return;
					try {
						const response = await getContentById(this.apiClient, contentId);
						const content = response.data.content;
						if (content?.title) {
							feedbackContentTitles[contentId] = content.title;
						}
					} catch {
						// Ignore lookup failures for sent feedback content titles.
					}
				}),
			);
			this.state = {
				...this.state,
				myFeedbacks,
				myFeedbacksLoaded: true,
				myFeedbacksLimit: limitCount ?? null,
				feedbackUsers: { ...this.state.feedbackUsers, ...feedbackUsers },
				feedbackContentTitles,
				contentsLoaded: true,
				contentsLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				myFeedbacksLoaded: true,
				myFeedbacksLimit: limitCount ?? null,
				contentsLoaded: true,
				contentsLoading: false,
			};
			this.showToast((err as Error).message || "送ったフィードバックの取得に失敗しました", "error");
		}
	}

	async loadUserPageProfile(userId: string) {
		if (this.state.userPageProfileLoading) {
			return;
		}
		this.state = { ...this.state, userPageProfileLoading: true };
		try {
			const response = await getUserById(this.apiClient, userId);
			const profile = response.data.user ?? null;
			this.state = {
				...this.state,
				userPageProfile: profile,
				userPageProfileLoaded: true,
				userPageProfileLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				userPageProfileLoaded: true,
				userPageProfileLoading: false,
			};
			this.showToast((err as Error).message || "ユーザー情報の取得に失敗しました", "error");
		}
	}

	async loadUserPageContents(userId: string) {
		if (this.state.userPageContentsLoading) {
			return;
		}
		this.state = { ...this.state, userPageContentsLoading: true };
		try {
			const response = await listUserContents(this.apiClient, userId);
			const contents = response.data.contents ?? [];
			utils.sortContentsByCreatedAt(contents);
			this.state = {
				...this.state,
				userPageContents: contents,
				userPageContentsLoaded: true,
				userPageContentsLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				userPageContentsLoaded: true,
				userPageContentsLoading: false,
			};
			this.showToast((err as Error).message || "コンテンツの取得に失敗しました", "error");
		}
	}

	async loadContentView(contentId: string) {
		if (this.state.contentViewLoading) {
			return;
		}
		const cachedContent =
			this.state.contents.find((item) => item.id === contentId) ??
			this.state.userPageContents.find((item) => item.id === contentId);
		if (cachedContent) {
			this.state = {
				...this.state,
				contentView: cachedContent,
				contentViewLoaded: true,
				contentViewLoading: false,
			};
			return;
		}
		this.state = { ...this.state, contentViewLoading: true };
		try {
			const response = await getContentById(this.apiClient, contentId);
			this.state = {
				...this.state,
				contentView: response.data.content ?? null,
				contentViewLoaded: true,
				contentViewLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				contentViewLoaded: true,
				contentViewLoading: false,
			};
			this.showToast((err as Error).message || "コンテンツの取得に失敗しました", "error");
		}
	}

	async loadContentViewOwner(userId: string) {
		if (this.state.contentViewOwnerLoading) {
			return;
		}
		this.state = { ...this.state, contentViewOwnerLoading: true };
		try {
			const response = await getUserById(this.apiClient, userId);
			this.state = {
				...this.state,
				contentViewOwner: response.data.user ?? null,
				contentViewOwnerLoaded: true,
				contentViewOwnerLoading: false,
			};
		} catch (err) {
			this.state = {
				...this.state,
				contentViewOwnerLoaded: true,
				contentViewOwnerLoading: false,
			};
			this.showToast((err as Error).message || "ユーザー情報の取得に失敗しました", "error");
		}
		await this.render();
	}

	renderMyProfile() {
		this.renderMyContent(
			this.state.profile,
			this.state.contents,
			{},
			this.state.feedbacks,
			this.state.myFeedbacks,
		);
	}

	renderProfileSetup() {
		const isEditRoute = this.state.route.name === "my-edit";
		const existingName = isEditRoute ? (this.state.profile?.name ?? "") : "";
		this.setContent(`
			<div class="row justify-content-center">
				<div class="col-md-6 col-lg-5">
					<div class="card shadow-sm">
						<div class="card-body">
							<h1 class="h5 mb-3">プロフィール登録</h1>
							<form id="profile-setup-form">
								<div class="mb-3">
									<label class="form-label" for="profile-name">名前</label>
									<input id="profile-name" class="form-control" type="text" placeholder="名前を入力" autocomplete="name" required />
								</div>
								<div class="d-grid">
									<button id="profile-save" class="btn btn-primary" type="submit">確定</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			</div>
		`);

		const form = utils.qsStrict<HTMLFormElement>("#profile-setup-form");
		const nameInput = utils.qsStrict<HTMLInputElement>("#profile-name");
		const saveBtn = utils.qsStrict<HTMLButtonElement>("#profile-save");
		nameInput.value = existingName;
		nameInput.focus();

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const name = nameInput.value.trim();
			if (!name) {
				this.showToast("名前を入力してください", "error");
				nameInput.focus();
				return;
			}

			saveBtn.disabled = true;
			saveBtn.textContent = "保存中...";
			try {
				await createUser(this.apiClient, name);
				this.showToast("プロフィールを登録しました");
				this.state = {
					...this.state,
					profile: null,
					profileLoaded: false,
					profileLoading: false,
					needsProfile: false,
				};
				if (isEditRoute) {
					utils.navigateTo("/my");
					return;
				}
				await this.render();
			} catch (err) {
				this.showToast((err as Error).message || "ユーザー情報の登録に失敗しました", "error");
			} finally {
				saveBtn.disabled = false;
				saveBtn.textContent = "確定";
			}
		});
	}

	renderContentCreate(content?: ContentRecord) {
		const isEdit = Boolean(content);
		const profileName = utils.escapeHtml(this.state.profile?.name ?? "-");
		const label = isEdit ? "編集" : "投稿";
		const title = isEdit ? `${profileName} のコンテンツ編集` : `${profileName} のコンテンツ投稿`;
		const submitLabel = isEdit ? "更新" : "投稿";
		const requiredAttr = isEdit ? "" : "required";
		const warningLines = isEdit ? (content?.warnings ?? []).filter(Boolean) : [];
		const warningText = warningLines.map((line) => utils.escapeHtml(line)).join("<br>");
		const warningsHtml =
			warningLines.length > 0 ? `<div class="alert alert-warning small mt-2">警告: ${warningText}</div>` : "";
		const stateLabelHtml = isEdit ? utils.getContentStateLabel(content?.state) : "";
		const zipName = content?.zipUrl ? utils.getFileNameFromUrl(content.zipUrl) : "";
		const existingZipLink =
			isEdit && content?.zipUrl && content?.state !== "failed"
				? `<div class="small mt-2">現在のZIP: <a href="${utils.escapeHtml(
						content.zipUrl,
					)}" target="_blank" rel="noopener">${utils.escapeHtml(zipName)}</a></div>`
				: "";
		this.setContent(`
			<div class="row justify-content-center">
				<div class="col-md-8 col-lg-6">
					<div class="card shadow-sm">
						<div class="card-body">
							<div class="d-flex align-items-start justify-content-between mb-3">
								<div>
									<div class="agd-label">${label}</div>
									<h1 class="h5 mb-0">${title}</h1>
								</div>
								<button id="back-to-my" class="btn btn-outline-secondary btn-sm" type="button">戻る</button>
							</div>
							<form id="content-create-form" class="d-grid gap-3">
								<div>
									<label class="form-label" for="content-title">コンテンツ名</label>
									<input id="content-title" class="form-control" type="text" placeholder="コンテンツ名を入力" required />
								</div>
								<div>
									<label class="form-label" for="content-description">説明</label>
									<textarea id="content-description" class="form-control" rows="4" placeholder="説明を入力"></textarea>
								</div>
								<div>
									<label class="form-label" for="content-zip">ZIP ファイル</label>
									<input
										id="content-zip"
										class="form-control"
										type="file"
										accept=".zip,application/zip,application/x-zip-compressed"
										${requiredAttr}
									/>
									${existingZipLink}
									${warningsHtml}
									${stateLabelHtml}
								</div>
								<div>
									<label class="form-label" for="content-thumb">サムネイル画像</label>
									<input
										id="content-thumb"
										class="form-control"
										type="file"
										accept="image/png,image/jpeg,image/webp"
										${requiredAttr}
									/>
								</div>
								<div>
									<label class="form-label">サムネプレビュー</label>
									<div class="d-flex justify-content-center border rounded p-3 bg-light text-center">
										<img id="content-thumb-preview" class="img-fluid agd-thumb" alt="サムネプレビュー" style="display: none;" />
										<div id="content-thumb-placeholder" class="text-secondary">サムネプレビュー</div>
									</div>
								</div>
								<div class="d-grid">
									<button id="content-submit" class="btn btn-primary" type="submit">${submitLabel}</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			</div>
		`);

		const backBtn = utils.qsStrict<HTMLButtonElement>("#back-to-my");
		backBtn.addEventListener("click", () => {
			utils.navigateTo("/my");
		});

		const form = utils.qsStrict<HTMLFormElement>("#content-create-form");
		const titleInput = utils.qsStrict<HTMLInputElement>("#content-title");
		const descInput = utils.qsStrict<HTMLTextAreaElement>("#content-description");
		const zipInput = utils.qsStrict<HTMLInputElement>("#content-zip");
		const thumbInput = utils.qsStrict<HTMLInputElement>("#content-thumb");
		const previewImg = utils.qsStrict<HTMLImageElement>("#content-thumb-preview");
		const previewPlaceholder = utils.qsStrict<HTMLDivElement>("#content-thumb-placeholder");
		const submitBtn = utils.qsStrict<HTMLButtonElement>("#content-submit");
		const existingZipUrl = content?.zipUrl ?? "";
		const hasExtractedPath = Boolean(content?.extractedPath);
		const existingThumbUrl = content?.thumbnailUrl ?? "";
		titleInput.value = content?.title ?? "";
		descInput.value = content?.description ?? "";
		titleInput.focus();

		let previewUrl: string | null = null;
		const updatePreview = () => {
			const file = thumbInput.files?.[0] ?? null;
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}
			if (!file) {
				if (existingThumbUrl) {
					previewImg.src = existingThumbUrl;
					previewImg.style.display = "block";
					previewPlaceholder.style.display = "none";
				} else {
					previewImg.style.display = "none";
					previewImg.src = "";
					previewPlaceholder.style.display = "block";
				}
				return;
			}
			previewUrl = URL.createObjectURL(file);
			previewImg.src = previewUrl;
			previewImg.style.display = "block";
			previewPlaceholder.style.display = "none";
		};
		thumbInput.addEventListener("change", updatePreview);
		if (existingThumbUrl) {
			updatePreview();
		}

		const maxZipSize = 20 * 1024 * 1024;
		const maxThumbSize = 20 * 1024 * 1024;
		const cacheControl = "public,max-age=604800,immutable";
		const zipMimeTypes = ["application/zip", "application/x-zip-compressed"];
		const imageMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
		const isZipFile = (file: File) => {
			const name = file.name.toLowerCase();
			const hasZipExt = name.endsWith(".zip");
			if (!file.type) {
				return hasZipExt;
			}
			return zipMimeTypes.includes(file.type) || hasZipExt;
		};
		const isImageFile = (file: File) => {
			const name = file.name.toLowerCase();
			const hasImageExt = [".png", ".jpg", ".jpeg", ".webp"].some((ext) => name.endsWith(ext));
			if (!file.type) {
				return hasImageExt;
			}
			return imageMimeTypes.includes(file.type) || hasImageExt;
		};
		const buildStorageUrl = (filePath: string) => {
			const bucket = this.firebase.storage.app.options.storageBucket;
			if (!bucket) {
				throw new Error("storageBucketが設定されていません");
			}
			return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
		};
		const uploadFile = async (file: File, kind: "zip" | "thumbnail", contentId: string) => {
			if (!contentId) {
				throw new Error("コンテンツIDが不正です");
			}
			const mimeType = file.type || (kind === "zip" ? "application/zip" : "image/png");
			if (utils.isDebugMode()) {
				const currentUser = this.state.user;
				if (!currentUser) {
					throw new Error("ログインが必要です");
				}
				if (/[\\/]/.test(file.name)) {
					throw new Error("ファイル名に使用できない文字が含まれています");
				}
				const objectName = kind === "zip" ? file.name : `${Date.now()}-${file.name}`;
				const objectPath = `uploads/${currentUser.uid}/contents/${kind}/${contentId}/${objectName}`;
				const storageRef = ref(this.firebase.storage, objectPath);
				await uploadBytes(storageRef, file, {
					contentType: mimeType,
					cacheControl,
				});
				return getDownloadURL(storageRef);
			}

			const uploadInfo = await createContentUploadUrl(this.apiClient, {
				kind,
				mimeType,
				fileName: kind === "zip" ? file.name : undefined,
				contentId,
			});
			const maxSize = kind === "zip" ? maxZipSize : maxThumbSize;
			const uploadResponse = await fetch(uploadInfo.data.url, {
				method: "PUT",
				headers: {
					"Content-Type": mimeType,
					"Cache-Control": cacheControl,
					"x-goog-content-length-range": `0,${maxSize}`,
				},
				body: file,
			});
			if (uploadResponse.ok === false) {
				throw new Error(`ファイルのアップロードに失敗しました: ${uploadResponse.statusText}`);
			}
			return buildStorageUrl(uploadInfo.data.filePath);
		};

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const title = titleInput.value.trim();
			if (!title) {
				this.showToast("コンテンツ名を入力してください", "error");
				titleInput.focus();
				return;
			}
			const zipFile = zipInput.files?.[0];
			if (!zipFile && !existingZipUrl && !hasExtractedPath) {
				this.showToast("ZIPファイルを選択してください", "error");
				return;
			}
			if (zipFile) {
				if (!isZipFile(zipFile)) {
					this.showToast("ZIPファイル形式のみ対応しています", "error");
					return;
				}
				if (zipFile.size > maxZipSize) {
					this.showToast("ZIPファイルのサイズが大きすぎます", "error");
					return;
				}
			}
			const thumbFile = thumbInput.files?.[0];
			if (!thumbFile && !existingThumbUrl) {
				this.showToast("サムネイル画像を選択してください", "error");
				return;
			}
			if (thumbFile) {
				if (!isImageFile(thumbFile)) {
					this.showToast("サムネイル画像はPNG/JPEG/WEBPのみ対応しています", "error");
					return;
				}
				if (thumbFile.size > maxThumbSize) {
					this.showToast("サムネイル画像のサイズが大きすぎます", "error");
					return;
				}
			}

			submitBtn.disabled = true;
			const submitLabelText = submitBtn.textContent;
			submitBtn.textContent = isEdit ? "更新中..." : "投稿中...";
			try {
				const description = descInput.value.trim();
				const descriptionValue = isEdit ? description : description || undefined;
				const contentId = isEdit
					? content?.id
					: (await createContent(this.apiClient, { title, description: descriptionValue })).data.contentId;
				if (!contentId) {
					throw new Error("コンテンツIDが不正です");
				}
				const zipUrl = zipFile ? await uploadFile(zipFile, "zip", contentId) : existingZipUrl || undefined;
				const thumbnailUrl = thumbFile
					? await uploadFile(thumbFile, "thumbnail", contentId)
					: existingThumbUrl;
				if (isEdit && content) {
					const updatePayload: UpdateContentInput = {
						title,
						description: descriptionValue,
						thumbnailUrl,
					};
					if (zipUrl) {
						updatePayload.zipUrl = zipUrl;
					}
					await updateContent(this.apiClient, content.id, updatePayload);
					this.showToast("更新しました");
				} else {
					if (!zipUrl) {
						throw new Error("ZIPファイルを選択してください");
					}
					await updateContent(this.apiClient, contentId, {
						title,
						description: descriptionValue,
						zipUrl,
						thumbnailUrl,
					});
					this.showToast("投稿しました");
				}
				this.state = {
					...this.state,
					contents: [],
					contentsLoaded: false,
					contentsLoading: false,
				};
				utils.navigateTo("/my");
			} catch (err) {
				this.showToast(
					(err as Error).message || (isEdit ? "更新に失敗しました" : "投稿に失敗しました"),
					"error",
				);
			} finally {
				submitBtn.disabled = false;
				submitBtn.textContent = submitLabelText || submitLabel;
			}
		});
	}

	renderContentDetail(
		content: ContentRecord,
		owner: UserProfile | null,
		options: {
			showFeedbackForm?: boolean;
			showFeedbackLoginPrompt?: boolean;
			showReportForm?: boolean;
		} = {},
	) {
		const title = utils.escapeHtml(content.title);
		const ownerName = utils.escapeHtml(owner?.name ?? "-");
		const ownerLink = `<a id="content-owner-link" class="text-decoration-none text-reset" href="/users/${encodeURIComponent(content.ownerId)}">${ownerName}</a>`;
		const descriptionText = content.description?.trim() ?? "";
		const description = utils.escapeHtml(descriptionText);
		const descriptionHtml = description
			? `<div class="agd-description text-start">${description}</div>`
			: '<div class="text-secondary">説明はありません</div>';
		const warningLines = (content.warnings ?? []).filter(Boolean);
		const warningText = warningLines.map((line) => utils.escapeHtml(line)).join("<br>");
		const warningsHtml =
			warningLines.length > 0 ? `<div class="alert alert-warning small mt-3">警告: ${warningText}</div>` : "";
		const stateLabelHtml = utils.getContentStateLabel(content.state);
		const thumbnail = content.thumbnailUrl
			? `<img class="img-fluid agd-thumb" src="${utils.escapeHtml(content.thumbnailUrl)}" alt="${title}" />`
			: '<div class="text-secondary">サムネイルがありません</div>';
		const createdAt = utils.formatTimestamp(content.createdAt);
		const updatedAt = utils.formatTimestamp(content.updatedAt);
		const metaLine = `${ownerLink} が ${createdAt} に投稿 (最終更新: ${updatedAt})`;
		const canDownload = content.state === "ok" && content.trusted !== false && Boolean(content.extractedPath);
		const downloadHtml = canDownload
			? `<div class="mt-4">
					<div class="fw-semibold mb-2">ダウンロード</div>
					<div id="content-files" class="small text-secondary">読み込み中...</div>
				</div>`
			: "";
		const showFeedbackForm = options.showFeedbackForm ?? false;
		const feedbackFormHtml = showFeedbackForm
			? `
			<div class="card shadow-sm mt-4">
				<div class="card-body">
					<h2 class="h6 mb-3">このユーザーにコメントを送る</h2>
					<form class="d-grid gap-3">
						<div>
							<label class="form-label" for="feedback-title">件名</label>
							<input id="feedback-title" name="title" class="form-control" type="text" required/>
						</div>
						<div>
							<label class="form-label" for="feedback-detail">内容</label>
							<textarea id="feedback-detail" name="detail" class="form-control" rows="4" required></textarea>
						</div>
						<div class="d-flex justify-content-center">
							<button id="send-feedback" class="btn btn-primary" type="button">送信</button>
						</div>
					</form>
				</div>
			</div>
		`
			: "";
		const showFeedbackLoginPrompt = options.showFeedbackLoginPrompt ?? false;
		const loginHref = `/login?next=${encodeURIComponent(window.location.pathname || "/")}${
			utils.isDebugMode() ? "&debug=true" : ""
		}`;
		const feedbackLoginPromptHtml = showFeedbackLoginPrompt
			? `
			<div class="card shadow-sm mt-4">
				<div class="card-body text-center text-secondary">
					ログインしてコメントしてください。
					<a class="text-decoration-none" href="${utils.escapeHtml(loginHref)}">ログイン</a>
				</div>
			</div>
		`
			: "";
		const showReportForm = options.showReportForm ?? false;
		const reportFormHtml = showReportForm
			? `
			<div class="d-flex justify-content-center">
				<button type="button" class="btn btn-danger mt-4" data-bs-toggle="modal" data-bs-target="#report-modal">
  					このゲームを通報する
				</button>
			</div>
			<div class="modal fade" id="report-modal" tabindex="-1" aria-labelledby="report-modal-label" aria-hidden="true">
				<div class="modal-dialog modal-dialog-centered">
					<div class="modal-content">
					<div class="modal-header">
						<h5 class="modal-title" id="report-modal-label">通報フォーム</h5>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<form id="report-form">
						<div class="modal-body">
						<p class="text-muted small">問題がある内容について教えてください。運営が内容を確認いたします。</p>
						
						<div class="mb-3">
							<label for="report-category" class="form-label fw-bold">理由（必須）</label>
							<select class="form-select" id="report-category" required>
							<option value="" disabled selected>選択してください</option>
							<option value="spam">スパム・広告</option>
							<option value="violation">公序良俗違反</option>
							<option value="other">その他</option>
							</select>
						</div>

						<div class="mb-3">
							<label for="report-description" class="form-label fw-bold">詳細（任意）</label>
							<textarea class="form-control" id="report-description" rows="4" placeholder="具体的な状況を教えてください"></textarea>
						</div>
						</div>
						<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
						<button type="submit" id="report-submit-btn" class="btn btn-danger">通報を送信する</button>
						</div>
					</form>
					</div>
				</div>
			</div>
		`
			: "";

		this.setContent(`
			<div class="row justify-content-center">
				<div class="col-md-8 col-lg-6">
					<div class="card shadow-sm">
						<div class="card-body">
							<div class="d-flex align-items-start justify-content-between mb-4">
								<div>
									<h1 class="h4 mb-1">${title}</h1>
									<div class="agd-meta">${metaLine}</div>
								</div>
							</div>
							<div class="d-flex justify-content-center mb-4">
								${thumbnail}
							</div>
							${descriptionHtml}
							${warningsHtml}
							${stateLabelHtml}
							${downloadHtml}
						</div>
					</div>
					${feedbackFormHtml}
					${feedbackLoginPromptHtml}
					${reportFormHtml}
				</div>
			</div>
		`);

		const ownerLinkEl = utils.qsStrict<HTMLAnchorElement>("#content-owner-link");
		ownerLinkEl.addEventListener("click", (event) => {
			event.preventDefault();
			utils.navigateTo(`/users/${encodeURIComponent(content.ownerId)}`);
		});
		if (canDownload) {
			const container = utils.qs<HTMLElement>("#content-files");
			if (container) {
				void loadContentFiles({
					content,
					storage: this.firebase.storage,
					container,
					isDebugMode: utils.isDebugMode(),
					messages: {
						unavailable: "ダウンロードできません",
						gameJsonFailed: "game.jsonの取得に失敗しました",
						listFailed: "ファイル一覧の取得に失敗しました",
					},
				});
			}
		}

		const sendFeedbackBtn = utils.qs<HTMLButtonElement>("#send-feedback");
		if (sendFeedbackBtn) {
			sendFeedbackBtn.addEventListener("click", async () => {
				const titleInput = utils.qs<HTMLInputElement>("#feedback-title");
				const detailInput = utils.qs<HTMLTextAreaElement>("#feedback-detail");
				const receiverId = content.ownerId;
				const title = titleInput?.value.trim() ?? "";
				const detail = detailInput?.value.trim() ?? "";

				if (!this.state.user || !receiverId) {
					this.showToast("送信できませんでした", "error");
					return;
				}

				if (!title || !detail) {
					this.showToast("件名と内容を入力してください", "error");
					return;
				}

				sendFeedbackBtn.disabled = true;
				try {
					await createFeedback(this.apiClient, receiverId, title, detail, content.id);
					if (titleInput) titleInput.value = "";
					if (detailInput) detailInput.value = "";
					this.showToast("送信しました");
				} catch (err) {
					this.showToast((err as Error).message, "error");
				} finally {
					sendFeedbackBtn.disabled = false;
				}
			});
		}
		const reportForm = utils.qs<HTMLFormElement>("#report-form");
		if (reportForm == null) {
			console.error("通報フォームがありません");
			return;
		}

		reportForm.addEventListener("submit", async (e: Event) => {
			e.preventDefault();
			const categorySelect = utils.qsStrict<HTMLSelectElement>("#report-category", reportForm);
			const descriptionTextarea = utils.qsStrict<HTMLTextAreaElement>("#report-description", reportForm);
			const submitBtn = utils.qsStrict<HTMLButtonElement>("#report-submit-btn", reportForm);
			const reportModalElement = utils.qsStrict<HTMLElement>("#report-modal");
			const category = categorySelect.value as "spam" | "violation" | "other";
			const description = descriptionTextarea.value;
			submitBtn.disabled = true;

			try {
				const result = await createReport(this.apiClient, {
					contentId: content.id,
					category,
					description,
				});

				if (result.data.reportId == null) {
					console.error("通報送信エラー: reportId がレスポンスに含まれていません。", result);
					this.showToast("送信に失敗しました。時間をおいて再度お試しください。", "error");
					return;
				}

				this.showToast("通報を送信しました。ご協力ありがとうございました。");

				Modal.getInstance(reportModalElement)?.hide();
				reportForm.reset();
			} catch (error) {
				console.error("送信エラー:", error);
				this.showToast("送信に失敗しました。時間をおいて再度お試しください。", "error");
			} finally {
				submitBtn.disabled = false;
			}
		});
	}

	renderMyContent(
		profile: UserProfile | null,
		contents: ContentRecord[],
		options: {
			allowEdit?: boolean;
			showActions?: boolean;
			showCreate?: boolean;
			nameLink?: string | null;
			showFeedbackForm?: boolean;
			showFeedbackLoginPrompt?: boolean;
		} = {},
		feedbacks?: FeedbackRecord[],
		myFeedbacks?: FeedbackRecord[],
	) {
		const allowEdit = options.allowEdit ?? true;
		const showActions = options.showActions ?? true;
		const showCreate = options.showCreate ?? true;
		const showFeedbackForm = options.showFeedbackForm ?? false;
		const showFeedbackLoginPrompt = options.showFeedbackLoginPrompt ?? false;
		const loginHref = `/login?next=${encodeURIComponent(window.location.pathname || "/")}${
			utils.isDebugMode() ? "&debug=true" : ""
		}`;
		const showLogout = showActions && this.state.user !== null;
		const showEditProfile = showActions && allowEdit;
		const showFeedback = showActions && allowEdit;
		const showFeedbackList = showFeedback && feedbacks !== undefined;
		const showSentFeedbackList = showFeedback && myFeedbacks !== undefined;
		const showCreateButton = showCreate && this.state.user !== null;
		const feedbackUsers = this.state.feedbackUsers;
		const feedbackContentTitles = this.state.feedbackContentTitles;
		const contentTitleById = new Map(contents.map((content) => [content.id, content.title]));
		const nameLink = options.nameLink ?? null;
		const currentUserId = profile?.uid ?? this.state.user?.uid ?? "";
		const name = profile?.name ?? "-";
		const createdAt = utils.formatTimestamp(profile?.createdAt);
		const safeName = utils.escapeHtml(name);
		const nameHtml = nameLink
			? `<a id="my-page-link" class="text-decoration-none text-reset" href="${utils.escapeHtml(
					nameLink,
				)}">${safeName} マイページ</a>`
			: `${safeName} マイページ`;
		const profileNotice = profile
			? ""
			: `
			<div class="alert alert-warning d-flex align-items-center" role="alert">
				<span>ユーザー情報が未登録です。バックエンドで作成してください。</span>
			</div>
		`;
		const feedbackSummaryLimit = 32;
		const feedbackItems = (feedbacks ?? [])
			.slice()
			.sort((a, b) => utils.getTimestampMillis(b.createdAt) - utils.getTimestampMillis(a.createdAt));
		const feedbackPreview = feedbackItems.slice(0, 5);
		const showFeedbackMoreButton =
			feedbackItems.length > 5 ||
			(this.state.feedbacksLimit !== null && feedbackItems.length === this.state.feedbacksLimit);
		const feedbackItemsHtml =
			feedbackPreview.length === 0
				? '<div class="agd-empty">フィードバックはまだありません。</div>'
				: `
					<div class="d-grid gap-3">
						${feedbackPreview
							.map((feedback) => {
								const title = utils.escapeHtml(feedback.title || "-");
								const detailText = (feedback.detail ?? "").replace(/\s+/g, " ").trim();
								const summaryBase = detailText || "-";
								const summary =
									summaryBase.length > feedbackSummaryLimit
										? `${summaryBase.slice(0, feedbackSummaryLimit)}...`
										: summaryBase;
								const createdAtText = utils.formatTimestamp(feedback.createdAt);
								const contentTitle = feedback.contentId
									? (contentTitleById.get(feedback.contentId) ?? "")
									: "";
								const contentTitleHtml = contentTitle
									? `<div class="text-secondary small">${utils.escapeHtml(
											contentTitle,
										)} に対して</div>`
									: "";
								const senderProfile = feedbackUsers[feedback.senderId ?? ""];
								const avatarUrl = senderProfile?.photoURL
									? utils.escapeHtml(senderProfile.photoURL)
									: "/image/icon_default.png";
								return `
									<div class="d-flex gap-3 align-items-start">
										<img class="agd-feedback-avatar rounded" src="${avatarUrl}" alt="sender" />
										<div class="flex-grow-1">
											${contentTitleHtml}
											<div class="fw-semibold">
												<a class="text-decoration-none text-dark js-feedback-title" href="#" data-feedback-id="${utils.escapeHtml(
													feedback.id,
												)}" data-feedback-type="received">${title}</a>
											</div>
											<div class="text-secondary small">${utils.escapeHtml(summary)}</div>
											<div class="text-secondary small">作成日: ${createdAtText}</div>
										</div>
									</div>
								`;
							})
							.join("")}
					</div>
				`;
		const sentFeedbackItems = (myFeedbacks ?? [])
			.slice()
			.sort((a, b) => utils.getTimestampMillis(b.createdAt) - utils.getTimestampMillis(a.createdAt));
		const sentFeedbackPreview = sentFeedbackItems.slice(0, 5);
		const showSentFeedbackMoreButton =
			sentFeedbackItems.length > 5 ||
			(this.state.myFeedbacksLimit !== null && sentFeedbackItems.length === this.state.myFeedbacksLimit);
		const sentFeedbackItemsHtml =
			sentFeedbackPreview.length === 0
				? '<div class="agd-empty">送ったフィードバックはまだありません。</div>'
				: `
					<div class="d-grid gap-3">
						${sentFeedbackPreview
							.map((feedback) => {
								const title = utils.escapeHtml(feedback.title || "-");
								const detailText = (feedback.detail ?? "").replace(/\s+/g, " ").trim();
								const summaryBase = detailText || "-";
								const summary =
									summaryBase.length > feedbackSummaryLimit
										? `${summaryBase.slice(0, feedbackSummaryLimit)}...`
										: summaryBase;
								const createdAtText = utils.formatTimestamp(feedback.createdAt);
								const contentTitle = feedback.contentId
									? (feedbackContentTitles[feedback.contentId] ?? "")
									: "";
								const contentTitleLabel = contentTitle || "コンテンツ";
								const contentHref = feedback.contentId
									? `/contents/${encodeURIComponent(feedback.contentId)}`
									: "";
								const contentTitleHtml = feedback.contentId
									? `<div class="text-secondary small"><a class="text-decoration-none text-secondary js-content-link" href="${utils.escapeHtml(
											contentHref,
										)}" data-content-id="${utils.escapeHtml(
											feedback.contentId,
										)}">${utils.escapeHtml(contentTitleLabel)}</a> に対して</div>`
									: "";
								const receiverProfile = feedbackUsers[feedback.receiverId];
								const avatarUrl = receiverProfile?.photoURL
									? utils.escapeHtml(receiverProfile.photoURL)
									: "/image/icon_default.png";
								const avatarHtml = `<a class="text-decoration-none js-user-link" href="/users/${encodeURIComponent(feedback.receiverId)}" data-user-id="${utils.escapeHtml(
									feedback.receiverId,
								)}"><img class="agd-feedback-avatar rounded" src="${avatarUrl}" alt="receiver" /></a>`;
								return `
									<div class="d-flex gap-3 align-items-start">
										${avatarHtml}
										<div class="flex-grow-1">
											${contentTitleHtml}
											<div class="fw-semibold">
												<a class="text-decoration-none text-dark js-feedback-title" href="#" data-feedback-id="${utils.escapeHtml(
													feedback.id,
												)}" data-feedback-type="sent">${title}</a>
											</div>
											<div class="text-secondary small">${utils.escapeHtml(summary)}</div>
											<div class="text-secondary small">作成日: ${createdAtText}</div>
										</div>
									</div>
								`;
							})
							.join("")}
					</div>
				`;
		const feedbackSectionHtml = showFeedbackList
			? `
				<div class="card shadow-sm mt-4 mb-4">
					<div class="card-body">
						<div class="d-flex align-items-center justify-content-between mb-3">
							<h2 class="h6 mb-0">もらったフィードバック</h2>
						</div>
						${feedbackItemsHtml}
						${
							showFeedbackMoreButton
								? `
						<div class="text-center mt-3">
							<button id="my-feedbacks-link" class="btn btn-link text-dark text-decoration-underline" type="button">もっと見る</button>
						</div>
					`
								: ""
						}
					</div>
				</div>
			`
			: "";
		const sentFeedbackSectionHtml = showSentFeedbackList
			? `
				<div class="card shadow-sm mt-4 mb-4">
					<div class="card-body">
						<div class="d-flex align-items-center justify-content-between mb-3">
							<h2 class="h6 mb-0">送ったフィードバック</h2>
						</div>
						${sentFeedbackItemsHtml}
						${
							showSentFeedbackMoreButton
								? `
						<div class="text-center mt-3">
							<button id="my-sent-feedbacks-link" class="btn btn-link text-dark text-decoration-underline" type="button">もっと見る</button>
						</div>
					`
								: ""
						}
					</div>
				</div>
			`
			: "";
		const feedbackModalHtml =
			showFeedbackList || showSentFeedbackList
				? `
				<div class="modal fade" id="feedback-modal" tabindex="-1" aria-hidden="true">
					<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
						<div class="modal-content">
							<div class="modal-header">
								<h5 class="modal-title" id="feedback-modal-title">フィードバック</h5>
								<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="閉じる"></button>
							</div>
							<div class="modal-body">
								<div class="text-secondary small mb-2" id="feedback-modal-date"></div>
								<div id="feedback-modal-detail" class="agd-description"></div>
							</div>
						</div>
					</div>
				</div>
			`
				: "";
		const contentsHtml =
			contents.length === 0
				? '<div class="agd-empty">コンテンツはまだありません。</div>'
				: `
					<div class="d-grid gap-3">
						${contents
							.map((content) => {
								const title = utils.escapeHtml(content.title);
								const description = content.description
									? `<div class="text-secondary small mt-1">${utils.escapeHtml(content.description)}</div>`
									: "";
								const stateLabel = utils.getStateListContentLabel(content.state);
								const stateLabelHtml = stateLabel;
								const contentLink = `/contents/${encodeURIComponent(content.id)}`;
								const titleLink = `<a class="text-decoration-none text-reset js-content-link" href="${utils.escapeHtml(
									contentLink,
								)}" data-content-id="${utils.escapeHtml(content.id)}">${title}</a>`;
								const contentCreatedAt = utils.formatTimestamp(content.createdAt);
								const thumbnail = content.thumbnailUrl
									? `<img class="agd-thumb-sm rounded" src="${utils.escapeHtml(content.thumbnailUrl)}" alt="${title}" />`
									: `<div class="agd-thumb-sm rounded bg-light d-flex align-items-center justify-content-center text-secondary">-</div>`;
								const thumbLink = `<a class="js-content-link" href="${utils.escapeHtml(
									contentLink,
								)}" data-content-id="${utils.escapeHtml(content.id)}">${thumbnail}</a>`;
								const editButton = allowEdit
									? `<button class="btn btn-sm btn-outline-secondary js-edit-content" type="button" data-content-id="${utils.escapeHtml(
											content.id,
										)}">編集</button>`
									: "";
								return `
									<div class="card shadow-sm">
										<div class="card-body">
											<div class="d-flex gap-3 align-items-start">
												${thumbLink}
												<div class="flex-grow-1">
													<div class="fw-semibold">${titleLink}</div>
													<div class="text-secondary small">作成日: ${contentCreatedAt}</div>
													${description}
													<div class="mt-1">${stateLabelHtml}</div>
												</div>
												${editButton}
											</div>
										</div>
									</div>
								`;
							})
							.join("")}
					</div>
				`;
		const actionsHtml =
			showEditProfile || showLogout
				? `
				<div class="agd-actions">
					${showEditProfile ? '<button id="edit-profile" class="btn btn-outline-primary">編集</button>' : ""}
					${showLogout ? '<button id="logout" class="btn btn-outline-secondary">ログアウト</button>' : ""}
				</div>
			`
				: "";
		const viewProfileHref = currentUserId ? `/users/${encodeURIComponent(currentUserId)}` : "";
		const viewProfileButtonHtml = viewProfileHref
			? `<a id="view-profile" class="btn btn-outline-secondary" href="${utils.escapeHtml(
					viewProfileHref,
				)}">プロフィール表示確認</a>`
			: "";
		const createButtonHtml = showCreateButton
			? `
			<div class="d-flex justify-content-center gap-2 mb-3">
				<button id="create-content" class="btn btn-primary">投稿</button>
				${viewProfileButtonHtml}
			</div>
		`
			: "";
		const feedbackFormHtml = showFeedbackForm
			? `
			<div class="card shadow-sm mt-4">
				<div class="card-body">
					<h2 class="h6 mb-3">このユーザーにコメントを送る</h2>
					<form class="d-grid gap-3">
						<div>
							<label class="form-label" for="feedback-title">件名</label>
							<input id="feedback-title" name="title" class="form-control" type="text" required/>
						</div>
						<div>
							<label class="form-label" for="feedback-detail">内容</label>
							<textarea id="feedback-detail" name="detail" class="form-control" rows="4" required></textarea>
						</div>
						<div class="d-flex justify-content-center">
							<button id="send-feedback" class="btn btn-primary" type="button" data-receiver-id="${utils.escapeHtml(
								profile?.uid ?? "",
							)}">送信</button>
						</div>
					</form>
				</div>
			</div>
		`
			: "";
		const feedbackLoginPromptHtml = showFeedbackLoginPrompt
			? `
			<div class="card shadow-sm mt-4">
				<div class="card-body text-center text-secondary">
					ログインしてコメントしてください。
					<a class="text-decoration-none" href="${utils.escapeHtml(loginHref)}">ログイン</a>
				</div>
			</div>
		`
			: "";
		this.setContent(`
			${profileNotice}
			<div class="agd-my-header">
				<div>
					<div class="agd-user-name">${nameHtml}</div>
					<div class="agd-meta">登録日: ${createdAt}</div>
				</div>
				${actionsHtml}
			</div>
			${createButtonHtml}
			<div class="card shadow-sm">
				<div class="card-body">
					<div class="d-flex align-items-center justify-content-between mb-3">
						<h2 class="h6 mb-0">コンテンツ一覧</h2>
					</div>
					${contentsHtml}
				</div>
			</div>
			${feedbackSectionHtml}
			${sentFeedbackSectionHtml}
			${feedbackFormHtml}
			${feedbackLoginPromptHtml}
			${feedbackModalHtml}
		`);

		this.bindMyActions();
	}

	bindMyActions() {
		const logoutBtn = utils.qs<HTMLButtonElement>("#logout");
		if (logoutBtn) {
			logoutBtn.addEventListener("click", async () => {
				await signOutCurrentUser(this.firebase);
				utils.navigateTo("/login");
			});
		}

		const createBtn = utils.qs<HTMLButtonElement>("#create-content");
		if (createBtn) {
			createBtn.addEventListener("click", () => {
				utils.navigateTo("/my/contents");
			});
		}

		const editBtn = utils.qs<HTMLButtonElement>("#edit-profile");
		if (editBtn) {
			editBtn.addEventListener("click", () => {
				utils.navigateTo("/my/edit");
			});
		}

		const viewProfileBtn = utils.qs<HTMLAnchorElement>("#view-profile");
		if (viewProfileBtn) {
			viewProfileBtn.addEventListener("click", (event) => {
				event.preventDefault();
				const userId = this.state.profile?.uid ?? this.state.user?.uid;
				if (!userId) return;
				utils.navigateTo(`/users/${encodeURIComponent(userId)}`);
			});
		}

		const myPageLink = utils.qs<HTMLAnchorElement>("#my-page-link");
		if (myPageLink) {
			myPageLink.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo("/my");
			});
		}

		const myFeedbacksLink = utils.qs<HTMLButtonElement>("#my-feedbacks-link");
		if (myFeedbacksLink) {
			myFeedbacksLink.addEventListener("click", () => {
				utils.navigateTo("/my/feedbacks");
			});
		}

		const mySentFeedbacksLink = utils.qs<HTMLButtonElement>("#my-sent-feedbacks-link");
		if (mySentFeedbacksLink) {
			mySentFeedbacksLink.addEventListener("click", () => {
				utils.navigateTo("/my/myFeedbacks");
			});
		}

		const contentEditButtons = utils.qsStrictAll<HTMLButtonElement>(this.rootEl, ".js-edit-content");
		contentEditButtons.forEach((button) => {
			const contentId = button.dataset.contentId;
			if (!contentId) return;
			button.addEventListener("click", () => {
				utils.navigateTo(`/contents/${encodeURIComponent(contentId)}/edit`);
			});
		});

		const userLinks = utils.qsStrictAll<HTMLAnchorElement>(this.rootEl, ".js-user-link");
		userLinks.forEach((link) => {
			const userId = link.dataset.userId;
			if (!userId) return;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo(`/users/${encodeURIComponent(userId)}`);
			});
		});

		const contentLinks = utils.qsStrictAll<HTMLAnchorElement>(this.rootEl, ".js-content-link");
		contentLinks.forEach((link) => {
			const contentId = link.dataset.contentId;
			if (!contentId) return;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				utils.navigateTo(`/contents/${encodeURIComponent(contentId)}`);
			});
		});

		this.bindFeedbackModal();

		const sendFeedbackBtn = utils.qs<HTMLButtonElement>("#send-feedback");
		if (sendFeedbackBtn) {
			sendFeedbackBtn.addEventListener("click", async () => {
				const titleInput = utils.qs<HTMLInputElement>("#feedback-title");
				const detailInput = utils.qs<HTMLTextAreaElement>("#feedback-detail");
				const receiverId = sendFeedbackBtn.dataset.receiverId ?? "";
				const title = titleInput?.value.trim() ?? "";
				const detail = detailInput?.value.trim() ?? "";

				if (!this.state.user || !receiverId) {
					this.showToast("送信できませんでした", "error");
					return;
				}

				if (!title || !detail) {
					this.showToast("件名と内容を入力してください", "error");
					return;
				}

				sendFeedbackBtn.disabled = true;
				try {
					await createFeedback(this.apiClient, receiverId, title, detail);
					if (titleInput) titleInput.value = "";
					if (detailInput) detailInput.value = "";
					this.showToast("送信しました");
				} catch (err) {
					this.showToast((err as Error).message, "error");
				} finally {
					sendFeedbackBtn.disabled = false;
				}
			});
		}
	}

	bindFeedbackModal() {
		const feedbackTitleLinks = utils.qsStrictAll<HTMLAnchorElement>(this.rootEl, ".js-feedback-title");
		if (feedbackTitleLinks.length === 0) {
			return;
		}
		const modalEl = utils.qs<HTMLElement>("#feedback-modal");
		const modalTitleEl = utils.qs<HTMLElement>("#feedback-modal-title");
		const modalDateEl = utils.qs<HTMLElement>("#feedback-modal-date");
		const modalDetailEl = utils.qs<HTMLElement>("#feedback-modal-detail");
		if (!modalEl || !modalTitleEl || !modalDateEl || !modalDetailEl) return;
		const modal = Modal.getOrCreateInstance(modalEl);
		feedbackTitleLinks.forEach((link) => {
			link.addEventListener("click", (event) => {
				event.preventDefault();
				const feedbackId = link.dataset.feedbackId ?? "";
				const feedbackType = link.dataset.feedbackType ?? "received";
				const feedbackItems = feedbackType === "sent" ? this.state.myFeedbacks : this.state.feedbacks;
				const feedback = feedbackItems.find((item) => item.id === feedbackId);
				if (!feedback) return;
				modalTitleEl.textContent = feedback.title;
				modalDateEl.textContent = `作成日: ${utils.formatTimestamp(feedback.createdAt)}`;
				const detailHtml = utils.escapeHtml(feedback.detail).replace(/\r?\n/g, "<br>");
				modalDetailEl.innerHTML = detailHtml;
				modal.show();
			});
		});
	}

	renderLogin() {
		const signedIn = this.state.user !== null;
		const params = new URLSearchParams(window.location.search);
		const nextPath = params.get("next");
		const redirectPath = nextPath && nextPath.startsWith("/") ? nextPath : "/my";
		if (signedIn) {
			utils.navigateTo(redirectPath);
			return;
		}
		this.setContent(`
		<div class="row justify-content-center">
			<div class="col-md-6 col-lg-5">
				<div class="card shadow-sm">
					<div class="card-body">
						<h1 class="h4 mb-3">ログイン</h1>
						<p class="text-secondary">下のボタンからGoogleでログインしてください。</p>
						<div class="d-grid gap-2">
							<button id="login-google" class="btn btn-primary">
							${signedIn ? "再ログイン" : "Googleでログイン"}
							</button>
							${signedIn ? '<button id="logout" class="btn btn-outline-secondary">ログアウト</button>' : ""}
						</div>
					</div>
				</div>
			</div>
		</div>
    `);

		const loginBtn = utils.qsStrict<HTMLButtonElement>("#login-google");
		loginBtn.addEventListener("click", async () => {
			try {
				await signInWithGoogle(this.firebase);
				this.showToast("ログインしました");
				utils.navigateTo(redirectPath);
			} catch (err) {
				this.showToast((err as Error).message, "error");
			}
		});

		if (signedIn) {
			const logoutBtn = utils.qsStrict<HTMLButtonElement>("#logout");
			logoutBtn.addEventListener("click", async () => {
				await signOutCurrentUser(this.firebase);
				utils.navigateTo("/login");
			});
		}
	}

	setContent(html: string, fullScreen = false) {
		this.rootEl.innerHTML = fullScreen ? html : `<div class="container agd-page">${html}</div>`;
	}

	showToast(message: string, type: "success" | "error" = "success") {
		this.toastEl.textContent = message;
		this.toastEl.className = `agd-toast ${type}`;
		this.toastEl.style.opacity = "1";
		setTimeout(() => {
			this.toastEl.style.opacity = "0";
		}, 3200);
	}
}
