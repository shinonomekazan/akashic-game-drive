import { createTextTd } from "../helpers";
import { ContentRecord, FeedbackRecord } from "../types";

export function convertContentToHtmlRow(content: ContentRecord) {
	const tr = document.createElement("tr");
	tr.appendChild(createTextTd(content.id));
	tr.appendChild(createTextTd(content.title));
	tr.appendChild(createTextTd(content.description ?? "-"));
	tr.appendChild(createTextTd(content.state ?? "-"));
	const warnings = content.warnings?.join(", ") ?? "-";
	tr.appendChild(createTextTd(warnings));
	tr.dataset.id = `${content.id}`;
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
