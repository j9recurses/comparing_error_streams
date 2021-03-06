// Server to handle streams

let Parallel = require('async-parallel');
let streamFxns = require('./StreamFunctions')
let fs = require('fs')
let stats = require("stats-lite")
let  io = require('socket.io')
let _ = require('lodash')

//parse incoming error stream
function StreamParser (currentVersion, newVersion, delimiter) {
  this.currentVersion = currentVersion
  this.newVersion = newVersion
  this.delimiter =  delimiter
  this.parseStream = function (eItem) {
    let lInfo = eItem.split(this.delimiter)
    return {
      'v': String(lInfo[1]),
      'ecode': String(lInfo[2]),
      'ts': lInfo[0]
    }
  }
}

//bin the data the data for a measurement
function MovingAverageBin(){
  this.binData = []
  this.binErrorCode = function(){
    this.binData.push(1)
  }
  //sum the bin
  this.sumBinData = function(){
    let sumBin = this.binData.reduce((a, b) => a + b, 0)
    this.binData = []
    return sumBin
  }
}

//find the moving window for an errorcode
function MovingAverageWindow(windowSteps){
  this.windowSteps = windowSteps
  this.movingAvgData = []
  this.movingAvgTimeStamps = []
  this.step = function (binSum, timestamp){
    this.movingAvgData.push(binSum)
    this.movingAvgTimeStamps.push(timestamp)
    //get rid of the oldest measurement in the window to make room for a new on
    if(this.movingAvgData.length > this.windowSteps){
      let popped = this.movingAvgData.shift();
      this.movingAvgTimeStamps.shift();
    }
  }
  this.getCurrentState = function(){
    //console.log(this.movingAvgData)
    if (this.movingAvgData.length !== windowSteps){
      console.log("not enough time has ellapsed")
      return {
        'start': 'na',
        'end': 'na',
        'windowAvg': 'na'
      }
    }
    sumOfWindowPerod = this.movingAvgData.reduce((a, b) => a + b, 0)

    //console.log(this.movingAvgData)
    let windowAvg =  sumOfWindowPerod / this.windowSteps
    return {
      'start':this.movingAvgTimeStamps[0],
      'end': this.movingAvgTimeStamps[this.movingAvgTimeStamps.length-1],
      'windowAvg': windowAvg
    }
    //return [this.movingAvgTimeStamps[this.movingAvgTimeStamps.length-1], windowAvg]
  }
}


//error code obj
function ErrorCode(errorCode){
  this.name = errorCode['ecode']
  this.firstSeen = errorCode['ts']
  this.totalTimesSeen = 1
  this.movingAvgEstimate = []
  ///this.lastAvgMovingEstimate
}

//build up the Obj by the version number
function VersionErrors(version, windowSteps){
  this.version = version
  this.errorCodes = {}
  this.windowSteps = windowSteps
  //add a error code to the bin
  this.addCodeToBin = function(errorCode){
    if ( this.errorCodes.hasOwnProperty(errorCode['ecode'])) {
      let ec = this.errorCodes[errorCode['ecode']]
      ec['movingAvgBin'].binErrorCode()
      ec.totalTimesSeen += 1
      this.errorCodes[errorCode['ecode']] = ec
    }else{
      let ec = new ErrorCode(errorCode)
      ec['movingAvgBin'] = new MovingAverageBin()
      ec['movingAvgWindow'] = new MovingAverageWindow(this.windowSteps)
      ec['movingAvgBin'].binErrorCode()
      this.errorCodes[errorCode['ecode']] = ec
    }
  }
  //sum the bin for a specific moment in time
  this.sumBinsAndAddStep = function(tsEllapsed){

    isEmpty = Object.keys(this.errorCodes).length === 0 && this.errorCodes.constructor === Object
    if(!isEmpty){
      let keys = Object.keys(this.errorCodes)
      for(let i = 0; i < keys.length; i++){
        let ec = this.errorCodes[keys[i]]
        let binSum = ec['movingAvgBin'].sumBinData()
        ec['movingAvgWindow'].step(binSum, tsEllapsed)
      }
    }
  }
  //get the final moving average val for a given period
  this.getCurrentMovingAvgEstimates = function(){
    let keys = Object.keys(this.errorCodes)
    if (keys.length === 0){
      console.log("*****NO DATA IS STREAMING*********")
      console.log("***CHECK THE ERROR STREAM***")
    }
    for(let i = 0; i < keys.length; i++){
      let ec = this.errorCodes[keys[i]]

      let currState = ec['movingAvgWindow'].getCurrentState()

      if(currState.windowAvg !== 'na'){
        let mva =  {"time": currState.end, "mav": currState.windowAvg}
        ec.movingAvgEstimate.push(mva)
      }

      currState['err_code'] = keys[i]

      currState['version'] = this.version
      //write the stream somewhere else
      writeStream.write(JSON.stringify(currState)+'\r\n');
    }
  }
  //get all the moving averages for each error code in the build version
  this.getMovingAvgEstimate = function(){
    let estimates = {}
    let keys = Object.keys(this.errorCodes)
    for(let i = 0; i < keys.length; i++){
      let mvE = this.errorCodes[keys[i]]['movingAvgEstimate']
      if(mvE.length > 0){
        estimates[keys[i]] = mvE
      }
    }
    if(estimates.length > 0){
      estimates  =  estimates.sort( function ( a, b ) { return parseInt(b.key) - parseInt(a.key) } )
    }
    return {
     'version': this.version,
      'estimates':estimates
    }
  }
  this.getSumErrors = function(){
    let totalErrors = 0
    let totalErrorsByErrCode = {}
    let keys = Object.keys(this.errorCodes)
    for(let i = 0; i < keys.length; i++){
      totalErrors += this.errorCodes[keys[i]]['totalTimesSeen']
      totalErrorsByErrCode[[keys[i]]] = this.errorCodes[keys[i]]['totalTimesSeen']
    }
    return { 'version' : this.version,
       'tot' : totalErrors,
       'totByEc': totalErrorsByErrCode
     }
  }
}

function CompareVersionErrors() {
  this.sums = {'currV': 0, 'newV':0}
  this.signifcantIncreases = {}
  this.currV = ""
  this.newV = ""
  this.newWindowStats = []
  this.currWindowStats = []
  this.getVersions = function(){
    return {
      'newV': this.newV,
      'currV': this.currV
    }
  }
  this.getAllErrorCodes = function(){
    return this.allErrorCodes
  }
  this.compareTwoVersions =  function(currentV, newV, threshold, ts){
    let signifcantIncreases = []
    let curVEst = currentV.getMovingAvgEstimate()
    let newVEst= newV.getMovingAvgEstimate()

    if(this.currV === ""){
       this.currV = curVEst['version']
    }
    if(this.newV === ""){
      this.newV = newVEst['version']
    }
    this.newWindowStats = newVEst['estimates']
    this.currWindowStats =  curVEst['estimates']
  }
  this.getSignifcantIncreases = function(){
    return {
      'newWindowStats': this.newWindowStats,
      'currWindowStats': this.currWindowStats
    }
  }
  this.setTotalErrors = function(currentV, newV){
    let newVSum = newV.getSumErrors()
    let currentVSum =  currentV.getSumErrors()
    let cv = currentVSum['version']
    let nv = newVSum['version']
    let change = streamFxns.getPercentChange( newVSum['tot'],currentVSum['tot'] )
    this.sums = {}
    this.sums[cv] = currentVSum['tot']
    this.sums[nv]  = newVSum['tot']
    this.sums['percentChange'] =  String(change) + "%"
    this.sums[cv+"byEc"] = currentVSum['totByEc']
    this.sums[nv+"byEc"] = newVSum['totByEc']
  }
  this.getTotalErrors =function(){
    return this.sums
  }
}

async function sumErrorBinsAndStep ( currentVersionErrors,newVersionErrors, ts, compareVersionErrors) {
  let listOfBuildObjs = [currentVersionErrors,newVersionErrors]
  await Parallel.each(listOfBuildObjs,  async item => {
      item.sumBinsAndAddStep(ts)
  }).then(function () {
          console.log('summed the bins')
          compareVersionErrors.setTotalErrors(currentVersionErrors,newVersionErrors)
        })
        .catch(function (err) {
            console.log("Error: Could not sum bins!");
            console.log(err)
   });
}


async function getAvgMovingWindowForErrors (currentVersionErrors,newVersionErrors, ts, compareVersionErrors, threshold) {
  let listOfBuildObjs = [currentVersionErrors,newVersionErrors]
  await Parallel.each(listOfBuildObjs,  async item => {
      item.getCurrentMovingAvgEstimates(ts)
  }).then(function () {
          compareVersionErrors.compareTwoVersions(currentVersionErrors,newVersionErrors,threshold,ts )
        })
        .catch(function (err) {
            console.log("Error: Could not get the current state!");
            console.log(err)
   });
}


let binRunner = 3600*24
let streamStart = new Date()
let movingAvgWindowTime = 20
let binWindow = 4
let threshold = 30
let windowSteps = movingAvgWindowTime / binWindow
let currentVersion = '5.0007.510.011'
let newVersion = '5.0007.610.011'
let delimiter = '\t'
let movingAvgLog = 'moving_avg_log.txt'

let writeStream = fs.createWriteStream(movingAvgLog);

let streamParser = new StreamParser(currentVersion, newVersion, delimiter)

let io1 = io.listen(8989)

let currentVersionErrors =  new VersionErrors(currentVersion, windowSteps)
let newVersionErrors = new VersionErrors(newVersion, windowSteps)
let compareVersionErrors = new CompareVersionErrors()

io1.on('connection', function(socket1) {
  socket1.on('error_stream', function(errorItem) {
      eItem = streamParser.parseStream(errorItem)
      if(eItem['v']=== newVersion){
        newVersionErrors.addCodeToBin(eItem)
      }else{
        currentVersionErrors.addCodeToBin(eItem)
      }
  })
})


let streamer1 = streamFxns.runIterval(function(){
    //console.log("running once every 5 seconds*****")
    let tsSeconds = Math.round(streamFxns.timeElapsed(streamStart))
    //let tsString = streamFxns.secondsToHMSStamp(tsSeconds)
      //console.log("*binning errors at : "+ tsString)
    ts = streamFxns.getTsNow()
    sumErrorBinsAndStep(currentVersionErrors,newVersionErrors, ts, compareVersionErrors);
    }, binWindow*1000, binRunner);


let streamer2 = streamFxns.runIterval(function(){
    //let versionObs = [currentVersionErrors,newVersionErrors];
    let tsSeconds = Math.round(streamFxns.timeElapsed(streamStart))
    let tsString = streamFxns.secondsToHMSStamp(tsSeconds)
    console.log('*getting the current state at: ' + ts)
    ts = streamFxns.getTsNow()
    getAvgMovingWindowForErrors(currentVersionErrors,newVersionErrors, ts, compareVersionErrors, threshold);
    }, movingAvgWindowTime*1000, binRunner);


var app = require('http').createServer(handler),
    io2 = io.listen(app) //require('socket.io').listen(80);
app.listen(8080);


function handler(req, res) {
    console.log('handler')
    fs.readFile(__dirname + '/index.html',
        function(err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading index.html');
            }
            res.writeHead(200);
            res.end(data);
        });
}
// Manage connections
io2.sockets.on('connection', function(socket) {
    console.log('handle connection');
    //this controls how often the server will send data to the web client
    var periodInMilliseconds = 5000;
    var timeoutId = -1;

    /**
     * Handle "disconnect" events.
     */
    var handleDisconnect = function() {
        console.log('handle disconnect');
        clearTimeout(timeoutId);
    };

    /**
     * Generate a request to be sent to the client.
     */
    var generateServerRequest = function() {
        //console.log('generate server request');
        //console.log("socket is emitting")
        //console.log("*socket is emitting***")

        socket.emit('server request', {
            movingAvgWindowTime: movingAvgWindowTime,
            binWindow: binWindow,
            versions: compareVersionErrors.getVersions(),
            allErroCodes: compareVersionErrors.getAllErrorCodes(),
            //totalErrors: compareVersionErrors.getTotalErrors(),
            movingAvgs: compareVersionErrors.getSignifcantIncreases()
        });

        timeoutId = setTimeout(generateServerRequest, periodInMilliseconds);
    };

    socket.on('disconnect', handleDisconnect);

    timeoutId = setTimeout(generateServerRequest, periodInMilliseconds);
});

