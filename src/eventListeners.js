export function onSearchInput() {
    this._selectedSearchIndex = -1;
    this.updateSearchResults(this._elements.searchInput.value, this._elements.resultsList);
}

export function onSearchFocus() {
    return this.updateSearchResults(this._elements.searchInput.value, this._elements.resultsList);
}

export function onSearchKeydown(event) {
    const items = this._elements.resultsList.querySelectorAll("li");

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (event.key === "ArrowDown") {
            if (this._selectedSearchIndex < items.length - 1) {
                this._selectedSearchIndex++;
            }
        } else if (event.key === "ArrowUp") {
            if (this._selectedSearchIndex > 0) {
                this._selectedSearchIndex--;
            }
        }

        items.forEach(item => item.classList.remove("selected"));
        items[this._selectedSearchIndex].classList.add("selected");
        items[this._selectedSearchIndex].scrollIntoView({block: "nearest"});
    } else if (event.key === "Enter") {
        event.preventDefault();
        if (this._selectedSearchIndex >= 0 && items[this._selectedSearchIndex]) {
            items[this._selectedSearchIndex].click();
        }
    } else if (event.key === "Escape") {
        this.clearSearchResults();
        this._elements.searchInput.blur();
    }
}

export function onSearchFocusout() {
    setTimeout(() => {
        if (!this._elements.selectdiv.contains(document.activeElement)) {
            this.clearSearchResults();
        }
    }, 150);
}

export function onClearIconClick() {
    this._elements.searchInput.value = "";
    this.clearSearchResults();
}