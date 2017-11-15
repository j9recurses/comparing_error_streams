// Client to simulate the error log stream

let ioC = require('socket.io-client')
let LineByLineReader = require('line-by-line')
let socket1 = ioC.connect('http://localhost:8989')
let errorStreamFn = 'ErrorStreamSetB.csv'

let streamFxns = require('./StreamFunctions')

function getErrorTimeStampinMilleseconds (line) {
  let l = line.split('\t')
  let ts = l[0].split(':')
  // minutes are worth 60 seconds. Hours are worth 60 minutes.
  let seconds = (+ts[0]) * 60 * 60 + (+ts[1]) * 60 + (+ts[2])
  return seconds
}

let streamStart = new Date()
let lr = new LineByLineReader(errorStreamFn, {start: 1})

lr.on('line', function (line) {

  let lineTs = getErrorTimeStampinMilleseconds(line)
  let programEllapsedTime = streamFxns.timeElapsed(streamStart)
  let timeDiff = lineTs - programEllapsedTime
  console.log()
  console.log('**** current program duration in seconds: ' + String(streamFxns.secondsToHMSStamp(programEllapsedTime)))
  //pause the file stream
  lr.pause()
  console.log('***waiting ' + String(timeDiff) + ' seconds to send ...')
  //set the timeout function to wait until the program ellapsed
  //time matches the error stream time stamp
  setTimeout(function () {
    console.log('sending => ' + line)
    //send error data to server
    socket1.emit('error_stream', line)
    lr.resume()
  }, timeDiff * 1000) //convert seconds to ms
})

lr.on('end', function () {
  console.log('*** Error stream is finished ***')
})

lr.on('error', function (err) {
  console.log('ERROR: file stream error')
  console.log(err)
})
