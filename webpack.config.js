'use strict';
const path = require('path');
module.exports = {
    entry: [
        path.join(__dirname, 'app/client/js/main.js')
    ],
    output: {
        path: path.join(__dirname, 'dist/js'),
        filename: '[name].js',
        publicPath: '/js/'
    },
    mode: 'production',
    module: {
        rules: [{
            test: /\.js?$/,
            exclude: /node_modules/,
            use:[{
                loader: 'babel-loader',
                options: {
                    presets: ["@babel/preset-env"]
                }
            }]
        }, {
            // Bootstrap 3's plugins expect jQuery as a global.
            test: /bootstrap\/js\//,
            use:[{
                loader: 'imports-loader',
                options:{
                    imports: 'default jquery jQuery'
                }
            }]
        }, {
            test   : /\.css$/,
            use: [
                "style-loader",
                "css-loader"
            ]
        }, {
            test: /\.(png|woff|woff2|eot|ttf|svg|gif)$/,
            type: 'asset',
            parser: {
                dataUrlCondition: {
                    maxSize: 100000
                }
            }
        }]
    }
};
