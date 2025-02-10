import css from "rollup-plugin-import-css";
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from "@rollup/plugin-commonjs";

export default [{
    input: "src/index.js",
    plugins: [nodeResolve({}), commonjs(), css()],
    output: {
        dir: "./dist",
        format: "es",
        sourcemap: true
    }
}];