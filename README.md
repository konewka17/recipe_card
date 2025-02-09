# Recipe Card for Home Assistant

A custom card for Home Assistant that allows you to display recipes from a YAML file. You can select a recipe from different categories, view its ingredients and instructions, and customize the card's appearance with ease.

## Features

- **Recipe Selection**: Display recipes grouped by category in a dropdown.
- **Dynamic Recipe Rendering**: Displays ingredients and cooking instructions of the selected recipe.
- **Random Recipe Display**: Shows a random recipe on initial load.
- **Customizable**: Modify the appearance and functionality by editing the code.

## Installation

To use this custom card, you need to install it via HACS (Home Assistant Community Store).

### Step 1: Install the Card via HACS

1. Go to HACS in your Home Assistant instance.
2. Click on the "Frontend" tab in the HACS section.
3. Click the three dots in the upper right and select "Custom Repositories".
4. Add the GitHub repository URL (e.g., `https://github.com/your-github-username/recipe-card`).
5. Select "Frontend" as the category, then click "Add".
6. Find the `recipe-card` in the available custom cards list and click "Install".

### Step 2: Add the Card to Your Lovelace UI

After installing the card via HACS, add it to your Home Assistant dashboard by editing the `ui-lovelace.yaml` or using the UI configuration.

#### Example:

```yaml
type: 'custom:recipe-card'
url: '/local/recipe.yaml'  # URL to your YAML file containing the recipes
