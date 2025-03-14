const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  entry: {
    popup: './src/popup.js',
    content_script: './src/content_script.js',
    background: './src/background.js'
  },
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].bundle.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              ['@babel/preset-react', { runtime: 'automatic' }]
            ],
            plugins: [
              '@babel/plugin-transform-runtime'
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name][ext]'
        }
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    new HtmlWebpackPlugin({
      template: './public/popup.html',
      filename: 'popup.html',
      chunks: ['popup']
    }),
    new CopyPlugin({
      patterns: [
        { 
          from: 'public/manifest.json',
          to: 'manifest.json'
        },
        {
          from: path.resolve(__dirname, 'icons'),
          to: path.resolve(__dirname, 'build/icons')
        },
        {
          from: 'public/models',
          to: 'models'
        }
      ]
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      'three': path.resolve('./node_modules/three')
    }
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        threejs: {
          test: /[\\/]node_modules[\\/](three|@react-three)[\\/]/,
          name: 'threejs',
          chunks: 'all',
        }
      }
    }
  }
};