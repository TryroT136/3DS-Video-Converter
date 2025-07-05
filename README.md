# 3DS Video Converter

A Node.js server that hosts a website that converts videos to a format compatible with the Nintendo 3DS browser and lets you watch them on the 3DS. Simply put in a link to any video and it will convert it and serve it to you.

### Usage

1. Clone this repository using `git`.
2. Navigate to the cloned repository in your terminal.
3. Install the dependencies using `npm install`.
4. Start the server using `node server.js` or `npm start`.
5. On your New Nintendo 3DS, open the web browser and navigate to `http://<your ip address>:3443`. Replace `<your ip address>` with the IP address of the computer running the server.
6. Enter the URL of a video you'd like to watch and click the "Convert Video" button.
7. The server will convert the video and serve it to you to watch on the 3DS.

### Supported Formats

The server supports converting videos to the following formats:

* H.264 video
* AAC audio
* MP4 container

This is because the New Nintendo 3DS browser only supports these formats.

### How It Works

The server works by using [ffmpeg](https://ffmpeg.org/) to convert the video to the desired format. It uses a very conservative set of settings to ensure maximum compatibility with the New Nintendo 3DS browser.

The server uses [Node.js](https://nodejs.org/) to host the website and handle video conversions.

The website must be served over HTTPS to be accessible on the New Nintendo 3DS. The server uses [mkcert](https://github.com/FiloSottile/mkcert) to generate a self-signed certificate for the HTTPS server.

The video must be served over HTTP for maximum compatibility with the New Nintendo 3DS browser. This is likely because the server is on the local network rather than an actual web server with proper SSL certificates.

### Known Issues

* The server currently only supports video playback over HTTP.
* The 3DS browser does not support copying link addresses to the clipboard, which makes it difficult to enter video URLs.

### Changelog

* 1.0.0 - Initial release.

### License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
