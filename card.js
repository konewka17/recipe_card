class RecipeCard extends HTMLElement {

    // private properties
    _config;
    _hass;
    _elements = {};

    // lifecycle
    constructor() {
        super();
        this.doCard();
        this.doStyle();
        this.doAttach();
        this.doQueryElements();
    }

    setConfig(config) {
        this._config = config;
        this.doCheckConfig();
    }

    set hass(hass) {
        this._hass = hass;
        // TODO fill card
    }

    // jobs
    doCheckConfig() {
        if (!this._config.entity) {
            throw new Error('Please define an entity!');
        }
    }

    doCard() {
        this._elements.card = document.createElement("ha-card");
        this._elements.card.innerHTML = `
            <div class="selectdiv"></div>
            <div class="content"></div>
        `
    }

    doStyle() {
        this._elements.style = document.createElement("style");
        this._elements.style.textContent = `
            .selectdiv {
                margin: 10px
            }
            .selectdiv > select {
                width: 100%;
                padding: 5px;
                border-radius: 10px;
            }
            .content {
                padding: 16px;
                font-family: Calibri
            }
            .recipe-title {
              font-size: 1.5em;
              font-weight: bold;
              margin-bottom: 10px;   
              border-bottom: black 1px solid;
              padding-bottom: 5px;
              font-family: Cambria;
            }
            .recipe-content{
              margin-left:20px;
            }
            .ingredient-list { 
              padding-inline-start: 20px;
              margin: 0;
            }
            .ingredient {
            }
            .amount {
            }
            .instruction-list {
              padding-inline-start: 20px;
              margin: 0;
            }
        `
    }

    doAttach() {
        this.attachShadow({ mode: "open" });
        this.shadowRoot.append(this._elements.style, this._elements.card);
    }

    doQueryElements() {
        const card = this._elements.card;
        this._elements.selectdiv = card.querySelector(".selectdiv")
        this._elements.content = card.querySelector(".content");
    }
}

customElements.define('recipe-card', RecipeCard);
