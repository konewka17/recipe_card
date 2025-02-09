import css from "rollup-plugin-import-css";
import nodeResolve from 'rollup-plugin-node-resolve';

export default [{
    input: "src/index.js",
    plugins: [nodeResolve({jsnext: true}), css()],
    output: {
        dir: "./dist",
        format: "es",
        sourcemap: true
    }
}];