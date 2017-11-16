
module.exports = {

runIterval: function(func, wait, times){
    var interv = function(w, t){
        return function(){
            if(typeof t === "undefined" || t-- > 0){
                setTimeout(interv, w);
                try{
                    func.call(null);
                }
                catch(e){
                    t = 0;
                    throw e.toString();
                }
            }
        }
    }(wait, times)
    setTimeout(interv, wait);
 },

 timeElapsed: function(startTime) {
  //get the ellapsed time in seconds
  let endTime = new Date()
  let timeDiff = endTime - startTime
  // strip the ms
  timeDiff /= 1000
   // get seconds
  return timeDiff
},

secondsToHMSStamp: function(seconds) {
    d = Number(seconds)
    let h = Math.floor(d / 3600)
    let m = Math.floor(d % 3600 / 60)
    let s = Math.floor(d % 3600 % 60)

    let hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    let mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    let sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return hDisplay + mDisplay + sDisplay
},



getTsNow: function(){
    d = new Date();
    ts = d.toTimeString().split(' ')[0]
    return ts
},
getPercentChange: function(newVal, currentVal){
    let diff = newVal -currentVal
    return (diff/currentVal)*100
},





}
