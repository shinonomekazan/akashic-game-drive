import { createBasicActionColumn, createTextTd, createTextTdWithCss } from "../helpers";
import { ContentRecord, FeedbackRecord, ManageUser, ReportRecord } from "../types";

export function convertContentToHtmlRow(content: ContentRecord) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(content.id));
	tr.appendChild(createTextTd(content.title));
	tr.appendChild(createTextTd(content.description ?? "-"));
	tr.appendChild(createTextTd(content.state ?? "-"));
	const warnings = content.warnings?.join(", ") ?? "-";
	tr.appendChild(createTextTd(warnings));
	tr.dataset.id = content.id;
	return tr;
}

export function convertMyFeedbackToHtmlRow(feedback: FeedbackRecord) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(feedback.id));
	tr.appendChild(createTextTd(feedback.receiverId));
	tr.appendChild(createTextTd(feedback.title));
	tr.appendChild(createTextTd(feedback.detail));
	tr.appendChild(createTextTd(feedback.contentId ?? "-"));
	tr.dataset.id = `${feedback.id}`;
	return tr;
}

export function convertFeedbackToHtmlRow(feedback: FeedbackRecord) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(feedback.id));
	tr.appendChild(createTextTd(feedback.senderId));
	tr.appendChild(createTextTd(feedback.title));
	tr.appendChild(createTextTd(feedback.detail));
	tr.appendChild(createTextTd(feedback.contentId ?? "-"));
	tr.dataset.id = `${feedback.id}`;
	return tr;
}

export function convertReportToHtmlRow(report: ReportRecord) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(report.id));
	tr.appendChild(createTextTd(report.reporterId ?? "-"));
	tr.appendChild(createTextTd(report.contentId ?? "-"));
	tr.appendChild(createTextTd(report.category ?? "-"));
	tr.appendChild(createTextTd(report.status ?? "-"));
	tr.appendChild(createBasicActionColumn());
	tr.dataset.id = report.id;
	return tr;
}

export function convertManageContentToHtmlRow(content: ContentRecord) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(content.id));
	tr.appendChild(createTextTd(content.title));
	tr.appendChild(createTextTd(content.state ?? "-"));
	tr.dataset.id = content.id;
	return tr;
}

export function convertContentFeedbackToHtmlRow(feedback: FeedbackRecord) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(feedback.id));
	tr.appendChild(createTextTd(feedback.senderId));
	tr.appendChild(createTextTd(feedback.title));
	tr.appendChild(createTextTd(feedback.detail));
	tr.dataset.id = `${feedback.id}`;
	return tr;
}

export function convertManageUserToHtmlRow(user: ManageUser) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(user.id));
	tr.appendChild(createTextTd(user.name));
	tr.appendChild(createTextTd(user.note ?? "-"));
	tr.appendChild(createTextTd(user.role ?? "-"));
	tr.dataset.id = user.id;
	return tr;
}
