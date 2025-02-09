import css from "rollup-plugin-import-css";

export default [{
    input: "src/index.js",
    plugins: [css()],
    output: {
        dir: "./dist",
        format: "es",
        sourcemap: true
    }
}];