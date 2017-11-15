# Comparing Error Streams

## Quick Start

1. This repo assumes you have node and npm installed on your computer
2. Clone the repo to your computer
3. Open the command line and then run `npm install`
4. Then run `npm run stream_errors`
5. Wait a couple of seconds for the streams to get started
4. Open your web browser and go to http://localhost:8080/

![](https://github.com/j9recurses/comparing_error_streams/blob/master/error_stream_gif.gif)

## The Task

Two different versions of an application, a new and old version, are emitting a stream of error codes.
Design and develop a tool that quickly identifies when error codes
from the new version of the application increase significantly
in comparison to the current version on a set of streaming error events.

Caveats:
  - The analysis must determine in "real-time" which error codes have seen a significant increase compared to the current version.
  - Perform the analysis time-step by time-step without looking ahead in the data

## App Design

My overall approach was to process the error stream with minimal latency at all stages of the process, from the point when data is aquired, to analytics and visualization and beyond.

There are three main componets to my application:

1. Streaming Client app:
  - The client app reads the test dataset file creates a near real time stream of error data.
  - The client app connects to the server app and then streams the error data to the server via websockets

2. The Server App
  - The server connects streaming client and listens for error code data
  - The server processes, accumulates and analayzes the error stream data continuously
  - The server simulatenously acts a web server, and allows other web browser clients to connect with it
  - When the server finished analyzing and processing for a given time-step, it emits the analysis to its web clients via web sockets

3. Web Browser Client
  - Using websockets, the web browser client listens for the server app to emit error analysis data.
  - When new analysis arrives, the web browser client presents a dashboard with visualizations to convey some insight about the error stream

## Processing the Error Processing and Stream Analysis

The error stream is fairly noisey, for certain time periods, many error codes will appear in a single second.
Our goal is to separate the signal from the noise and detect important patterns in the data.

### Using the Moving Average
The [moving average](https://en.wikipedia.org/wiki/Moving_average) is a way to smooth the streaming data.
It tells us if the number of errors for a given error code are going up or down over time.

Once you have calcualted the moving average for each error type for a given player version, you can compare the moving averages at a given time step
to determine if there is an increase in a specific error.

The moving average finds the mean of set of observations in a given window.
By finding the the mean value of set of observations in a given time period, you reduce the effect of fluctations in the data.
The moving average is lagging indicator; it follows behind a event, changing only after somehting has changed (in our case, frequency of error codes).
This makes it a good candiate to confirm that a pattern is occuring within in a given error code/player version.

### Calculating the Moving Average For Finding Patterns the Error Stream

The moving average has some properties that give it the ability to incrementally and continuously rolling up streaming data
as you move forward in time.

In my app, for each time step, I binned/counted the number of times that an error code appeared- this was my observed value for a step in time.
After counting the number of times I saw an error code in a period, I no longer needed to keep track of that data in my program.
The moving average is "moving" because it is continously recomputed itself as new data becomes availble.
The moving average progresses by dropping the earliest value in a period and adding the latest value.
The process of dropping older values ensures that the data that your processing never gets too unwieldy.

### Additional Stream Analysis
Beyond the moving average, I also stored the sum of all each type of error. I did not end up using them in my visualization.
I also wanted to also find the moving standard deviation of the error stream but I ran out of time.
The moving standard deviation would be helpful because it would give us a measure of how "stable" an error code is.
For instance, if we found a low moving standard deviation for an error code in a player version, this would indicate the number of errors seen in a window period is pretty stable (ie aka the number of errors are not spiking/fluctuationg much)

### Visualization
I was able to visualize the moving average for each error code in real time using the [smoothie charting library](https://github.com/joewalnes/smoothie)
As new error codes are discovered in the error stream, they get added to the browswer window in real time.
If I had more time, I would visualize the sum of the all the errors for each error code and spend more time on layout and styling....

## Technical Stack
For this project, I used node js.
Node is good choice for this project because it has some good libraries/features to deal with various streams.
Additionally, node let me quickly stand up web server. The [socket.io](https://socket.io/) library also made it straight forward/easy for the server to connect and manage to the client stream and web client over websockets.

###Other improvements

If I had more time, I would do the following:

-use parameters and/or configuration files for certain variables
-Allow the user to change the step/time interval of the moving average in the web ui/visualization
-Calculate the moving standard deviation
-write tests/unit tests
-organize my code better and format/lint it (its pretty lumpy as of now)
