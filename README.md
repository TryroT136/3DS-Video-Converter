# 3DS Video Converter

A Node.js server that hosts a website that lets you, on the New Nintendo 3DS browser, put in a link to any video and it will convert it to the correct format and you can watch the video on the 3DS.

This tool converts videos to a format compatible with the Nintendo 3DS browser, using FFmpeg.

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

### Known Issues

* idk

### Changelog

* 1.0.0 - Initial release.

### License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
