class RecipeCard extends HTMLElement {

    // private properties
    _config;
    _hass;
    _elements = {};
    _parsedRecipes;
    _recipeIndex;

    // lifecycle
    constructor() {
        super();
        this.yamlEntryToLi = this.yamlEntryToLi.bind(this);
        this.doCard();
        this.doStyle();
        this.doAttach();
        this.doQueryElements();
    }

    setConfig(config) {
        this._config = config;
        this.doCheckConfig();
        this.doFetchRecipes();
        this.doFillCard();
    }

    set hass(hass) {
        this._hass = hass;
    }

    // jobs
    doCheckConfig() {
        if (!this._config.url) {
            throw new Error("Please define a url in config!");
        }
    }

    async doFetchRecipes() {
        try {
            const response = await fetch(this._config.url);
            const yamlText = await response.text();

            this._parsedRecipes = window.jsyaml.load(yamlText);
            // this._recipeIndex = Math.floor(Math.random() * this._parsedRecipes.length);
            this._recipeIndex = 121;
        } catch (error) {
            throw new Error(`Error fetching or parsing the recipe file: ${error}`);
        }
    }

    doCard() {
        this._elements.card = document.createElement("ha-card");
        this._elements.card.innerHTML = `
            <div class="selectdiv"></div>
            <div class="content"></div>
        `;
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
        `;
    }

    doAttach() {
        this.attachShadow({mode: "open"});
        this.shadowRoot.append(this._elements.style, this._elements.card);
    }

    doQueryElements() {
        const card = this._elements.card;
        this._elements.selectdiv = card.querySelector(".selectdiv");
        this._elements.content = card.querySelector(".content");
    }

    doFillCard() {
        this.doFillSelect();
        this.doFillContent();
    }

    doFillSelect() {
        let groupedRecipes = this._parsedRecipes.reduce((grouped, recipe) => {
            const category = recipe.category || "Onbekend";
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(recipe);
            return grouped;
        }, {});

        const categoryOptions = Object.keys(groupedRecipes).map(category => {
            // TODO fill with id
            const options = groupedRecipes[category].map(recipe => {
                return `<option value="${recipe.name}">${recipe.name}</option>`;
            }).join("");
            return `<optgroup label="${category}">${options}</optgroup>`;
        }).join("");

        this.selectdiv.innerHTML = `
            <select id="recipe-selector">
                <option value="">Select a recipe...</option>
                ${categoryOptions}
            </select>
        `;

        this.selectdiv.querySelector("#recipe-selector").addEventListener("change", (event) => {
            const selectedRecipeName = event.target.value;
            this._recipeIndex = this._parsedRecipes.findIndex(recipe => recipe.name === selectedRecipeName);
            if (this._recipeIndex !== -1) {
                this.doFillContent();
            }
        });

    }

    doFillContent() {
        this.recipe = this._parsedRecipes[this._recipeIndex];
        if (!this.recipe) {
            this.content.innerHTML = "Loading recipe...";
            return;
        }

        this.content.innerHTML = `
            <div class="recipe-title">${this.recipe.name}</div>
            <div class="recipe-content">
                <i>Ingrediënten${this.recipe?.persons ? ` (${this.recipe.persons} personen)` : ""}:</i>
                <ul class="ingredient-list">
                    ${this.recipe.ingredients.map(this.yamlEntryToLi).join("")}
                </ul>
                <br/> 
                <i>Bereiding:</i>
                <ol class="instruction-list">
                    ${this.recipe.instructions.map(this.yamlEntryToLi).join("")}
                </ol>
            </div>
        `;
    }

    // helpers
    yamlEntryToLi(yamlEntry) {
        if (Array.isArray(yamlEntry)) {
            return "<ul>" + yamlEntry.map(val => this.yamlEntryToLi(val)).join("") + "</ul>";
        } else if (typeof yamlEntry === "object") {
            let [key, value] = Object.entries(yamlEntry)[0];
            key = key.charAt(0).toUpperCase() + key.slice(1);
            if (value) {
                if (Array.isArray(value)) {
                    value = "<ul>" + value.map(val => this.yamlEntryToLi(val)).join("") + "</ul>";
                }
                value = ": " + value;
            } else {
                value = "";
            }
            return `<li><span class="ingredient">${key}</span><span class="amount">${value}</span></li>`;
        } else {
            yamlEntry = yamlEntry.charAt(0).toUpperCase() + yamlEntry.slice(1);
            return `<li>${yamlEntry}</li>`;
        }
    }
}

customElements.define("recipe-card", RecipeCard);
