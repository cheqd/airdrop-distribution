const path = require('path')
const webpack = require('webpack')

module.exports = {
    target: "webworker",
    entry: {
        bundle: "./index.js"
    },
    mode: process.env.NODE_ENV || 'production',
    plugins: [
        new webpack.ProvidePlugin({
            Buffer: [ 'buffer', 'Buffer' ],
            crypto: "crypto-browserify",
            stream: "stream-browserify",
            path: "path-browserify",
        })
    ],
    resolve: {
        fallback: {
            buffer: require.resolve('buffer'),
            crypto: require.resolve('crypto-browserify'),
            stream: require.resolve('stream-browserify'),
            path: require.resolve('path-browserify'),
        }
    },
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'bundle.mjs',
    },
    watchOptions: {
        ignored: /node_modules|dist|\.js/g,
    },
}