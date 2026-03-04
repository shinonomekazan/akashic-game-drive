export function createButton(type: "button" | "submit" | "reset", text: string) {
	const tag = document.createElement("button");
	tag.type = type;
	tag.classList.add("btn");
	tag.textContent = text;
	return tag;
}

export function createEditButton(text?: string) {
	const button = createButton("button", text ?? "編集");
	button.classList.add("btn-secondary", "editButton");
	return button;
}

export function createDeleteButton(text?: string) {
	const button = createButton("button", text ?? "削除");
	button.classList.add("btn-danger", "deleteButton");
	return button;
}

export function createActionColumn(buttons: HTMLButtonElement[]) {
	const action = document.createElement("td");
	buttons.forEach((button) => {
		button.classList.add("me-2");
		action.appendChild(button);
	});
	return action;
}

export function createBasicActionColumn() {
	return createActionColumn([createEditButton(), createDeleteButton()]);
}
