class Recipe_card extends HTMLElement {
    constructor() {
        super();
        this._yamlEntryToLi = this._yamlEntryToLi.bind(this);
    }

    setConfig(config) {
        if (!config.url) {
            throw new Error("URL must be specified for recipe.yaml file");
        }
        this.config = config;
        this._fetchRecipeData();
    }

    set hass(hass) {
        this._hass = hass;
        if (!this.content) {
            const card = document.createElement("ha-card");
            this.selectdiv = document.createElement("div");
            this.selectdiv.classList.add("selectdiv");
            card.appendChild(this.selectdiv);
            this.content = document.createElement("div");
            this.content.classList.add("content");
            card.appendChild(this.content);
            this.appendChild(card);
        }
    }

    _groupRecipesByCategory(recipes) {
        return recipes.reduce((grouped, recipe) => {
            const category = recipe.category || "Uncategorized"; // Default to "Uncategorized" if no category
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(recipe);
            return grouped;
        }, {});
    }

    _renderInputSelect() {
        let groupedRecipes = this._groupRecipesByCategory(this.parsedRecipes);
        const categoryOptions = Object.keys(groupedRecipes).map(category => {
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

        // Attach event listener
        this.selectdiv.querySelector("#recipe-selector").addEventListener("change", (event) => {
            const selectedRecipeName = event.target.value;
            this.recipe_index = this.parsedRecipes.findIndex(recipe => recipe.name === selectedRecipeName);
            if (this.recipe_index !== -1) {
                this.render();
            }
        });
    }

    _yamlEntryToLi(yamlEntry) {
        if (Array.isArray(yamlEntry)) {
            return "<ul>" + yamlEntry.map(val => this._yamlEntryToLi(val)).join("") + "</ul>";
        } else if (typeof yamlEntry === "object") {
            let [key, value] = Object.entries(yamlEntry)[0];
            key = key.charAt(0).toUpperCase() + key.slice(1);
            if (value) {
                if (Array.isArray(value)) {
                    value = "<ul>" + value.map(val => this._yamlEntryToLi(val)).join("") + "</ul>";
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

    async _fetchRecipeData() {
        try {
            const response = await fetch(this.config.url);
            const yamlText = await response.text();

            this.parsedRecipes = window.jsyaml.load(yamlText);
            this._renderInputSelect();
            this.recipe_index = Math.floor(Math.random() * this.parsedRecipes.length);
            this.recipe_index = 121;
            this.render();
        } catch (error) {
            console.error("Error fetching or parsing the recipe file:", error);
        }
    }

    render() {
        this.recipe = this.parsedRecipes[this.recipe_index];
        if (!this.recipe) {
            this.content.innerHTML = "Loading recipe...";
            return;
        }

        this.content.innerHTML = `
          <style>
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
          </style>
        <div class="recipe-title">${this.recipe.name}</div>
        <div class="recipe-content">
        <i>Ingrediënten${this.recipe?.persons ? ` (${this.recipe.persons} personen)` : ""}:</i>
        <ul class="ingredient-list">
            ${this.recipe.ingredients.map(this._yamlEntryToLi).join("")}
        </ul>
        <br/> 
        <i>Bereiding:</i>
        <ol class="instruction-list">
            ${this.recipe.instructions.map(this._yamlEntryToLi).join("")}
        </ol>
        </div>
    `;
    }

    getCardSize() {
        return 3;
    }
}

customElements.define("recipe-card", Recipe_card);