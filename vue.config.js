module.exports = {
  // if the app is supposed to run on Github Pages in a subfolder, use the following config:
  // publicPath: process.env.NODE_ENV === "production" ? "/mytownsquare/" : "/" //github config
  publicPath: process.env.NODE_ENV === "production" ? "/" : "/" // other config
};
