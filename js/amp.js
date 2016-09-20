

// INITS
var audioPlayer, input2;
var demoSampleURLs = [
  "assets/audio/Guitar_DI_Track.mp3",
  "assets/audio/LasseMagoDI.mp3",
  "assets/audio/RawPRRI.mp3",
  "assets/audio/Di-Guitar.mp3",
  "assets/audio/NarcosynthesisDI.mp3",
  "assets/audio/BlackSabbathNIB_rythmDI.mp3",
  "assets/audio/BlackSabbathNIBLead_DI.mp3",
  "assets/audio/BasketCase Greenday riff DI.mp3",
  "assets/audio/InBloomNirvanaRiff1DI.mp3",
  "assets/audio/Muse1Solo.mp3",
  "assets/audio/Muse2Rythm.mp3"
];


function gotStream() {
    // Create an AudioNode from the stream.
    audioPlayer = document.getElementById('player');
    try {
        // if ShadowDOMPolyfill is defined, then we are using the Polymer
        // WebComponent polyfill that wraps the HTML audio
        // element into something that cannot be used with
        // createMediaElementSource. We use ShadowDOMPolyfill.unwrap(...)
        // to get the "real" HTML audio element
        audioPlayer = ShadowDOMPolyfill.unwrap(audioPlayer);
    } catch(e) {
        console.log("ShadowDOMPolyfill undefined, running native Web Component code");
    }

    if(input2 === undefined) {
        input2 = audioContext.createMediaElementSource(audioPlayer);
    }

    var input = audioContext.createMediaStreamSource(window.stream);
    audioInput = convertToMono(input);

    createAmp(audioContext, audioInput, input2);
    console.log('AMP CREATED')
}

function changeDemoSample(val) {
    console.log(val);
  audioPlayer.src = demoSampleURLs[val];
  audioPlayer.play();
}

var amp;
var analyzerAtInput, analyzerAtOutput;
var guitarPluggedIn = false;
var convolverSlider;
var convolverCabinetSlider;
var guitarInput;

// Create the amp
function createAmp(context, input1, input2) {
    guitarInput = input1;

    // create quadrafuzz
    amp = new Amp(context);
    analyzerAtInput = context.createAnalyser();
    amp.input.connect(analyzerAtInput);

    // build graph
    if(guitarPluggedIn) {
        guitarInput.connect(amp.input);
    }

    // connect audio player to amp for previewing presets
    input2.connect(amp.input);

    // output, add an analyser at the end
    analyzerAtOutput = context.createAnalyser();
    amp.output.connect(analyzerAtOutput);
    analyzerAtOutput.connect(context.destination);

    convolverSlider = document.querySelector('#convolverSlider');
    convolverCabinetSlider = document.querySelector('#convolverCabinetSlider');

    initVisualizations();
}

function toggleGuitarInput(event) {
    var button = document.querySelector("#toggleGuitarIn");

    if(!guitarPluggedIn) {
        guitarInput.connect(amp.input);
        button.innerHTML = "Guitar input: <span style='color:green;'>ACTIVATED</span>, click to toggle on/off!";
        button.classList.remove("pulse");
    } else {
        guitarInput.disconnect();
        button.innerHTML = "Guitar input: <span style='color:red;'>NOT ACTIVATED</span>, click to toggle on/off!";
        button.classList.add("pulse");
    }
    guitarPluggedIn = !guitarPluggedIn;
}

// Visualizations
var inputVisualization, outputVisualization;

function initVisualizations() {
    inputVisualization = new Visualization();
    inputVisualization.configure("inputSignalCanvas", analyzerAtInput);

    outputVisualization = new Visualization();
    outputVisualization.configure("outputSignalCanvas", analyzerAtOutput);


    // start updating the visualizations
    requestAnimationFrame(visualize);
}

function visualize() {
    inputVisualization.update();
    outputVisualization.update();

    requestAnimationFrame(visualize);
}

// effects
//----------- EQUALIZER ----------- 
function Equalizer(ctx) {
    var filters = [];

    // Set filters
    [60, 170, 350, 1000, 3500, 10000].forEach(function (freq, i) {
        var eq = ctx.createBiquadFilter();
        eq.frequency.value = freq;
        eq.type = "peaking";
        eq.gain.value = 0;
        filters.push(eq);
    });

    // Connect filters in serie
    //sourceNode.connect(filters[0]);

    for (var i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
    }

    // connect the last filter to the speakers
    //filters[filters.length - 1].connect(ctx.destination);

    function changeGain(sliderVal, nbFilter) {
        // sliderVal in [-30, +30]
        var value = parseFloat(sliderVal);
        filters[nbFilter].gain.value = value;

        // update output labels
        //var output = document.querySelector("#gain" + nbFilter);
        //output.value = value + " dB";

        // update sliders
        //var numSlider = nbFilter + 1;
        //var slider = document.querySelector("#EQ" + numSlider + "slider");
        //slider.value = value;

        // refresh amp slider state in the web component GUI
        var sliderWC = document.querySelector("#slider" + (nbFilter+1));
        // second parameter set to false will not fire an event
        sliderWC.setValue(parseFloat(sliderVal).toFixed(0), false);
    }

    function setValues(values) {
        values.forEach(function (val, index) {
            changeGain(val, index);
        });
    }

    function getValues() {
        var values = [];
        filters.forEach(function (f, index) {
            values.push(f.gain.value);
        });
        return values;
    }

    return {
        input: filters[0],
        output: filters[filters.length - 1],
        setValues: setValues,
        getValues: getValues,
        changeGain: changeGain
    };
}

// ----------- AMP ---------------

function Amp(context) {
    var presets = [];
    var menuPresets = document.querySelector("#QFPresetMenu2");
    var menuDisto = document.querySelector("#distorsionMenu");
    // for the waveshapers from the preamp
    var wsFactory = new WaveShapers();
    buildDistoMenu();

    var currentDistoName = "standard";
    var currentK = 2; // we have separates ks, but also a "global" one that
                      // is the max of the four (the knob value)
    var currentWSCurve = wsFactory.distorsionCurves[currentDistoName](currentK);
    // for Wave Shaper Curves visualization
    var distoDrawer, signalDrawer;
    var DRAWER_CANVAS_SIZE = 100;
    var distoDrawer = new CurveDrawer("distoDrawerCanvas");
    var signalDrawer = new CurveDrawer("signalDrawerCanvas");
    drawCurrentDisto();

    // ------------
    // PREAM STAGE
    // ------------
    // Channel booster
    var boost = new Boost(context);

    // Main input and output and bypass
    var input = context.createGain();
    var output = context.createGain();
    var byPass = context.createGain();
    byPass.gain.value = 0;

    // amp input gain towards pream stage
    var inputGain = context.createGain();
    inputGain.gain.value = 1;

    // low and high cut filters
    var lowCutFilter = context.createBiquadFilter();
    lowCutFilter.type = "highpass";
    lowCutFilter.frequency.value = 20;

    var hiCutFilter = context.createBiquadFilter();
    hiCutFilter.type = "lowpass";
    hiCutFilter.frequency.value = 12000;


    // band filters for quadrafuzz like circuitry
    var filters = [];
    var lowpassLeft = context.createBiquadFilter();
    lowpassLeft.frequency.value = 147;
    lowpassLeft.type = "lowpass";
    filters[0] = lowpassLeft;

    var bandpass1Left = context.createBiquadFilter();
    bandpass1Left.frequency.value = 587;
    bandpass1Left.type = "bandpass";
    filters[1] = bandpass1Left;

    var bandpass2Left = context.createBiquadFilter();
    bandpass2Left.frequency.value = 2490;
    bandpass2Left.type = "bandpass";
    filters[2] = bandpass2Left;

    var highpassLeft = context.createBiquadFilter();
    highpassLeft.frequency.value = 4980;
    highpassLeft.type = "highpass";
    filters[3] = highpassLeft;

    // overdrives
    var k = [2, 2, 2, 2]; // array of k initial values
    var od = [];
    var gainsOds = [];
// noprotect  
    for (var i = 0; i < 4; i++) {
        od[i] = context.createWaveShaper();
        od[i].curve = makeDistortionCurve(k[i]);
        // Oversampling generates some (small) latency
        //od[i].oversample = '4x';

        // gains
        gainsOds[i] = context.createGain();
        gainsOds[i].gain.value = 1;
    }

    // output gain after amp stage
    var outputGain = context.createGain();
    outputGain.gain.value = 1;

    // ------------------------------
    // POWER AMP AND TONESTACK STAGES
    // ------------------------------
    var bassFilter = context.createBiquadFilter();
    bassFilter.frequency.value = 100;
    bassFilter.type = "lowshelf";

    var midFilter = context.createBiquadFilter();
    midFilter.frequency.value = 1700;
    midFilter.type = "peaking";

    var trebleFilter = context.createBiquadFilter();
    trebleFilter.frequency.value = 6500;
    trebleFilter.type = "highshelf";

    var presenceFilter = context.createBiquadFilter();
    presenceFilter.frequency.value = 3900;
    presenceFilter.type = "peaking";

    // -----------------------------------
    // POST PROCESSING STAGE (EQ, reverb)
    // -----------------------------------
    var eq = new Equalizer(context);
    var bypassEQg = context.createGain();
    bypassEQg.gain.value = 0; // by defaut EQ is in
    var inputEQ = context.createGain();

    var cabinetSim, reverb;
    // Master volume
    var masterVolume = context.createGain();

/*
    reverb = new Reverb(context, function () {
        console.log("reverb created");

        cabinetSim = new CabinetSimulator(context, function () {
            console.log("cabinet sim created");

            doAllConnections();

        });
    });
*/

    reverb = new Convolver(context, reverbImpulses, "reverbImpulses");
    cabinetSim = new Convolver(context, cabinetImpulses, "cabinetImpulses");

    doAllConnections();

    // -------------------
    // END OF AMP STAGES
    // -------------------

    function doAllConnections() {
        // called only after reverb and cabinet sim could load and
        // decode impulses

        // Build web audio graph, set default preset
        buildGraph();
        initPresets();

        setDefaultPreset();
        console.log("running");
    }


    function buildGraph() {
        input.connect(inputGain);
        input.connect(byPass);

        // boost is not activated, it's just a sort of disto at 
        // the very beginning of the amp route
        inputGain.connect(boost.input);

        boost.output.connect(lowCutFilter);
        lowCutFilter.connect(hiCutFilter);

        for (var i = 0; i < 4; i++) {
            hiCutFilter.connect(filters[i]);
            filters[i].connect(od[i]);
            od[i].connect(gainsOds[i]);
            gainsOds[i].connect(outputGain);
        }
        // tonestack
        outputGain.connect(bassFilter);
        bassFilter.connect(midFilter);
        midFilter.connect(trebleFilter);
        trebleFilter.connect(presenceFilter);

        // post process
        presenceFilter.connect(inputEQ);
        // bypass eq route
        presenceFilter.connect(bypassEQg);
        bypassEQg.connect(masterVolume);

        // normal route
        inputEQ.connect(eq.input);
        eq.output.connect(masterVolume);
        masterVolume.connect(reverb.input);

        reverb.output.connect(cabinetSim.input);
        cabinetSim.output.connect(output);
        //eq.output.connect(output);
        //reverb.output.connect(output);

        // byPass route
        byPass.connect(output);
    }

    function boostOnOff(cb) {  
        // called when we click the switch on the GUI      
        boost.toggle();

        adjustOutputGainIfBoostActivated();
        updateBoostLedButtonState(boost.isActivated());
    }

    function changeBoost(state) {
        console.log("changeBoost, boost before: " + boost.isActivated() + " output gain=" + output.gain.value );

        if(boost.isActivated() !== state) {
            // we need to adjust the output gain
            console.log("changeBoost: we change boost state");
            boost.onOff(state);
            adjustOutputGainIfBoostActivated();
            updateBoostLedButtonState(boost.isActivated());
        } else {
            console.log("changeBoost: we do not change boost state");
        }

        console.log("changeBoost, boost after: " + boost.isActivated());
    }

    function adjustOutputGainIfBoostActivated() {
        console.log("adjustOutputGainIfBoostActivated: output gain value before = " + output.gain.value)

        if(boost.isActivated()) {
            output.gain.value /= 2;
        } else {
            output.gain.value *= 2;
        }
        console.log("adjustOutputGainIfBoostActivated: output gain value after = " + output.gain.value)
    }

    function updateBoostLedButtonState(activated) {
        // update buttons states
        var boostSwitch = document.querySelector("#toggleBoost");

        if(boost.isActivated()) {
            boostSwitch.setValue(1,false);
        } else {
            boostSwitch.setValue(0,false);
        }
    }


    function changeInputGainValue(sliderVal) {
        input.gain.value = parseFloat(sliderVal);
    }

    function changeOutputGainValue(sliderVal) {
        output.gain.value = parseFloat(sliderVal)/10;
        console.log("changeOutputGainValue value = " + output.gain.value);
    }


    function changeLowCutFreqValue(sliderVal) {
        var value = parseFloat(sliderVal);
        lowCutFilter.frequency.value = value;

        // update output labels
        var output = document.querySelector("#lowCutFreq");
        output.value = parseFloat(sliderVal).toFixed(1) + " Hz";

        // refresh slider state
        var slider = document.querySelector("#lowCutFreqSlider");
        slider.value = parseFloat(sliderVal).toFixed(1);
    }

    function changeHicutFreqValue(sliderVal) {
        var value = parseFloat(sliderVal);
        hiCutFilter.frequency.value = value;

        // update output labels
        var output = document.querySelector("#hiCutFreq");
        output.value = parseFloat(sliderVal).toFixed(1) + " Hz";

        // refresh slider state
        var slider = document.querySelector("#hiCutFreqSlider");
        slider.value = parseFloat(sliderVal).toFixed(1);
    }

  function changeBassFilterValue(sliderVal) {
        // sliderVal is in [0, 10]
        var value = parseFloat(sliderVal);
        bassFilter.gain.value = (value-5) * 3;
        console.log("bass gain set to " + bassFilter.gain.value);

        // update output labels
        //var output = document.querySelector("#bassFreq");
        //output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        //var slider = document.querySelector("#bassFreqSlider");
        //slider.value = parseFloat(sliderVal).toFixed(1);

        // refresh knob state
        var knob = document.querySelector("#Knob4");
        knob.setValue(parseFloat(sliderVal).toFixed(1), false);
    }

    function changeMidFilterValue(sliderVal) {
        // sliderVal is in [0, 10]
        var value = parseFloat(sliderVal);
        midFilter.gain.value = (value-5) * 2;

        // update output labels
        //var output = document.querySelector("#midFreq");
        //output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        //var slider = document.querySelector("#midFreqSlider");
        //slider.value = parseFloat(sliderVal).toFixed(1);

        // refresh knob state
        var knob = document.querySelector("#Knob5");
        knob.setValue(parseFloat(sliderVal).toFixed(1), false);
    }

    function changeTrebleFilterValue(sliderVal) {
        // sliderVal is in [0, 10]
        var value = parseFloat(sliderVal);
        trebleFilter.gain.value = (value-5) * 5;

        // update output labels
        //var output = document.querySelector("#trebleFreq");
        //output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        //var slider = document.querySelector("#trebleFreqSlider");
        //slider.value = parseFloat(sliderVal).toFixed(1);

        // refresh knob state
        var knob = document.querySelector("#Knob6");
        knob.setValue(parseFloat(sliderVal).toFixed(1), false);
    }

    function changePresenceFilterValue(sliderVal) {
        // sliderVal is in [0, 10]
        var value = parseFloat(sliderVal);
        presenceFilter.gain.value = (value-5) * 2;
        //console.log("set presence freq to " + presenceFilter.frequency.value)

        // update output labels
        //var output = document.querySelector("#presenceFreq");
        //output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        //var slider = document.querySelector("#presenceFreqSlider");
        //slider.value = parseFloat(sliderVal).toFixed(1);

        // refresh knob state
        var knob = document.querySelector("#Knob8");
        knob.setValue(parseFloat(sliderVal).toFixed(1), false);
    }

    // Build a drop down menu with all distorsion names
    function buildDistoMenu() {
        for(var p in wsFactory.distorsionCurves) {
            var option = document.createElement("option");
            option.value = p;
            option.text = p;
            menuDisto.appendChild(option);    
        }
        menuDisto.onchange = changeDistoType;
    }

    function changeDistoType() {
        console.log("Changing disto to : " + menuDisto.value);
        currentDistoName = menuDisto.value;      
        changeDrive(currentK);
    }

    function changeDistoTypeFromPreset(name) {
        currentDistoName = name;
        menuDisto.value = name;
        changeDrive(currentK);
    }

    function changeDrive(sliderValue) {
      // sliderValue in [0,10]
      // We can imagine having some "profiles here" -> generate
      // different K values from one single sliderValue for the
      // drive.
      var profileValues = [1, 1, 1, 1];
      // other values i.e [0.5, 0.5, 0.8, 1] -> less distorsion
      // on bass frequencies and top high frequency
      
      for(var i = 0; i < 4; i++) {
        // less distorsion on bass channels
        if(i < 2) {
            changeDistorsionValues(sliderValue/2, i);
        } else {
            changeDistorsionValues(sliderValue, i);
        }
        
      }
    }

    function changeDistorsionValues(sliderValue, numDisto) {
        // sliderValue is in [0, 10] range, adjust to [0, 1500] range  
        var value = 150 * parseFloat(sliderValue);
        var minp = 0;
        var maxp = 1500;

        // The result should be between 10 an 1500
        var minv = Math.log(10);
        var maxv = Math.log(1500);

        // calculate adjustment factor
        var scale = (maxv - minv) / (maxp - minp);

        value = Math.exp(minv + scale * (value - minp));
        // end of logarithmic adjustment

        k[numDisto] = value;
        //console.log("k = " + value + " pos = " + logToPos(value));
        od[numDisto].curve = makeDistortionCurve(k[numDisto]);
        //od[numDisto].curve = makeDistortionCurve(sliderValue);
        // update output labels
        var output = document.querySelector("#k" + numDisto);
        output.value = parseFloat(sliderValue).toFixed(1);

        // update sliders
        var numSlider = numDisto + 1;
        var slider = document.querySelector("#K" + numSlider + "slider");
        slider.value = parseFloat(sliderValue).toFixed(1);

        // refresh knob state
        var knob = document.querySelector("#Knob3");
        var maxPosVal1 = Math.max(logToPos(k[2]), logToPos(k[3]));
        var maxPosVal2 = Math.max(logToPos(k[0]), logToPos(k[1]));
        var maxPosVal = Math.max(maxPosVal1, maxPosVal2);
        //var maxPosVal = Math.max(logToPos(k[2]), logToPos(k[3]));
        var linearValue = parseFloat(maxPosVal).toFixed(1);
        knob.setValue(linearValue, false);
        // in [0, 10]
        currentK = linearValue;
        // redraw curves
        drawCurrentDisto();
    }

    function logToPos(logValue) {
        var minp = 0;
        var maxp = 1500;

        // The result should be between 10 an 1500
        var minv = Math.log(10);
        var maxv = Math.log(1500);

        // calculate adjustment factor
        var scale = (maxv - minv) / (maxp - minp);

        return (minp + (Math.log(logValue) - minv) / scale)/150;
    }

    function changeOversampling(cb) {
        for (var i = 0; i < 4; i++) {
            if(cb.checked) {
                // Oversampling generates some (small) latency
                od[i].oversample = '4x';
                boost.setOversampling('4x');
                console.log("set oversampling to 4x");
            } else {
                od[i].oversample = 'none';
                 boost.setOversampling('none');
                console.log("set oversampling to none");
            }
         }
         // Not sure if this is necessary... My ears can't hear the difference
         // between oversampling=node and 4x ? Maybe we should re-init the
         // waveshaper curves ?
         changeDistoType();
    }

    // Returns an array of distorsions values in [0, 10] range
    function getDistorsionValue(numChannel) {
        var pos = logToPos(k[numChannel]);
        return parseFloat(pos).toFixed(1);
    }

    function drawCurrentDisto() {
        var c = currentWSCurve;
        distoDrawer.clear();
        drawCurve(distoDrawer, c);

        // draw signal
        signalDrawer.clear();
        signalDrawer.drawAxis();
        signalDrawer.makeCurve(Math.sin, 0, Math.PI * 2);
        signalDrawer.drawCurve('red', 2);

        //signalDrawer.makeCurve(distord, 0, Math.PI*2);
        var c1 = distord();
        drawCurve(signalDrawer, c1);
    }
    function distord() {
        // return the curve of sin(x) transformed by the current wave shaper
        // function
        // x is in [0, 2*Math.PI]
        // sin(x) in [-1, 1]

        // current distorsion curve
        var c = currentWSCurve;
        var curveLength = c.length;

        var c2 = new Float32Array(DRAWER_CANVAS_SIZE);
        // sin(x) -> ?
        // [-1, 1] -> [0, length -1]

        // 100 is the canvas size.
        var incX = 2 * Math.PI / DRAWER_CANVAS_SIZE;
        var x = 0;
        for (var i = 0; i < DRAWER_CANVAS_SIZE; i++) {
            var index = map(Math.sin(x), -1, 1, 0, curveLength - 1);
            c2[i] = c[Math.round(index)];
            x += incX;
        }
        return c2;
    }


    function changeQValues(sliderVal, numQ) {
        var value = parseFloat(sliderVal);
        filters[numQ].Q.value = value;

        // update output labels
        var output = document.querySelector("#q" + numQ);
        output.value = value.toFixed(1);

        // update sliders
        var numSlider = numQ + 1;
        var slider = document.querySelector("#Q" + numSlider + "slider");
        slider.value = value;

    }

    function changeFreqValues(sliderVal, numF) {
        var value = parseFloat(sliderVal);
        filters[numF].frequency.value = value;

        // update output labels
        var output = document.querySelector("#freq" + numF);
        output.value = value + " Hz";
        // refresh slider state
        var numSlider = numF + 1;
        var slider = document.querySelector("#F" + numSlider + "slider");
        slider.value = value;
    }

    // volume aka preamp output volume
    function changeOutputGain(sliderVal) {
        // sliderVal is in [0, 10]
        // Adjust to [0, 1]
        var value = parseFloat(sliderVal/10);
        outputGain.gain.value = value;

        // update output labels
        //var output = document.querySelector("#outputGain");
        //output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        //var slider = document.querySelector("#OGslider");
        //slider.value = parseFloat(sliderVal).toFixed(1);

        // refresh knob state
        var knob = document.querySelector("#Knob1");
        knob.setValue(parseFloat(sliderVal).toFixed(1), false);
    }

    function changeMasterVolume(sliderVal) {
        // sliderVal is in [0, 10]
        var value = parseFloat(sliderVal);
        masterVolume.gain.value = value;

        // update output labels
        //var output = document.querySelector("#MVOutputGain");
        //output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        //var slider = document.querySelector("#MVslider");
        //slider.value = parseFloat(sliderVal).toFixed(1);
        
        // refresh knob state
        var knob = document.querySelector("#Knob2");
        knob.setValue(parseFloat(sliderVal).toFixed(1), false);
    }

    function changeReverbGain(sliderVal) {
        // slider val in [0, 10] range
        // adjust to [0, 1]
        var value = parseFloat(sliderVal) / 10;
        reverb.setGain(value);

        // update output labels
        //var output = document.querySelector("#reverbGainOutput");
        //output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        //var slider = document.querySelector("#convolverSlider");
        //slider.value = parseFloat(sliderVal).toFixed(1);

        // refresh knob state
        var knob = document.querySelector("#Knob7");
        knob.setValue(parseFloat(sliderVal).toFixed(1), false);
    }

    function changeReverbImpulse(name) {
        reverb.loadImpulseByName(name);
    }

    function changeRoom(sliderVal) {
        // slider val in [0, 10] range
        // adjust to [0, 1]
        console.log('change room');
        var value = parseFloat(sliderVal) / 10;
        cabinetSim.setGain(value);

        // update output labels
        var output = document.querySelector("#cabinetGainOutput");
        output.value = parseFloat(sliderVal).toFixed(1);

        // refresh slider state
        var slider = document.querySelector("#convolverCabinetSlider");
        slider.value = parseFloat(sliderVal).toFixed(1);

    }

    function changeCabinetSimImpulse(name) {
        cabinetSim.loadImpulseByName(name);
    }

    function changeEQValues(eqValues) {
        eq.setValues(eqValues);
    }

    function makeDistortionCurve(k) {
        // compute a new ws curve for current disto name and current k
        currentWSCurve = wsFactory.distorsionCurves[currentDistoName](k);
        return currentWSCurve;
    }

    // --------
    // PRESETS
    // --------
    function initPresets() {
        // updated 10/4/2016
        preset1 = {"name":"Clean 1","distoName":"standard","boost":false,"LCF":200,"HCF":12000,"K1":"0.0","K2":"0.0","K3":"0.0","K4":"0.0","F1":147,"F2":569,"F3":1915,"F4":4680,"Q1":"0.0","Q2":"49.0","Q3":"42.0","Q4":"11.0","OG":"5.0","BF":"5.0","MF":"4.2","TF":"3.1","PF":"5.0","EQ":[-2,-1,0,3,-9,-4],"MV":"5.8","RN":"Fender Hot Rod","RG":"2.0","CN":"Vintage Marshall 1","CG":"2.0"};
        presets.push(preset1);

        preset2 = {
            "name":"Crunch 1",
            "LCF":90,
            "HCF":7000,
            "K1":"4.7",
            "K2":"4.1",
            "K3":"10.0",
            "K4":"10.0",
            "F1":147,
            "F2":569,
            "F3":1915,
            "F4":4680,
            "Q1":0,
            "Q2":49,
            "Q3":42,
            "Q4":11,
            "OG":7.9,
            "BF":5,
            "MF":5,
            "TF":5,
            "PF":5,
            "EQ":[-2,-1,2,2,-7,-13],
            "MV":"0.7",
            "RG":"2.0",
            "CG":"5.4"
        }
        presets.push(preset2);

        preset3 = {
            "name":"Clean 2",
            "LCF":242,
            "HCF":17165,
            "K1":"0.0",
            "K2":"0.0",
            "K3":"0.0",
            "K4":"0.0",
            "F1":204,
            "F2":300,
            "F3":2904,
            "F4":5848,
            "Q1":0,
            "Q2":29,
            "Q3":55,
            "Q4":20,
            "OG":"7.1",
            "BF":7.2,
            "MF":6.5,
            "TF":5.9,
            "PF":8,
            "EQ":[-2,-1,-2,4,11,3],
            "MV":"8.3",
            "RG":"2.8",
            "CG":"6.3"
        };
        presets.push(preset3);

        preset4 = {"name":"Funk Blues Clean","distoName":"standard","LCF":242,"HCF":7000,"K1":"5.0","K2":"5.0","K3":"9.9","K4":"9.9","F1":204,"F2":300,"F3":2904,"F4":5848,"Q1":"0.0","Q2":"29.0","Q3":"55.0","Q4":"20.0","OG":"2.1","BF":"9.9","MF":"6.5","TF":"2.7","PF":"8.0","EQ":[9,11,-19,-22,11,-15],"MV":"2.6","RG":"0.0","CG":"6.3"};
        presets.push(preset4);

        preset5 = {
            "name":"Marshall Hi Gain",
            "LCF":345,
            "HCF":18461,
            "K1":"10.0",
            "K2":"10.0",
            "K3":"10.0",
            "K4":"10.0",
            "F1":186,
            "F2":792,
            "F3":2402,
            "F4":6368,
            "Q1":2,
            "Q2":1,
            "Q3":1,
            "Q4":1,
            "OG":"0.2",
            "BF":"4.8",
            "MF":"4.1",
            "TF":"5.9",
            "PF":"8.3",
            "EQ":[14,7,28,3,22,18],
            "MV":"2",
            "RG":"2",
            "CG":"7.4"
        };
        presets.push(preset5);

        preset6 = {"name":"Aerosmith WTW","distoName":"standard","LCF":345,"HCF":7000,"K1":"3.3","K2":"3.3","K3":"6.6","K4":"6.6","F1":186,"F2":792,"F3":2402,"F4":6368,"Q1":"2.0","Q2":"1.0","Q3":"1.0","Q4":"1.0","OG":"0.6","BF":"4.8","MF":"4.1","TF":"3.4","PF":"8.3","EQ":[12,2,22,13,16,18],"MV":"2.2","RG":"0.0","CG":"0.0"};
 
        presets.push(preset6);

        preset7 = {"name":"MW 1","LCF":10,"HCF":7000,"K1":"5.0","K2":"8.5","K3":"10.0","K4":"2.0","F1":186,"F2":792,"F3":2402,"F4":6368,"Q1":16,"Q2":1,"Q3":1,"Q4":5,"OG":"0.4","BF":"6.0","MF":"2.4","TF":"3.7","PF":"2.6","EQ":[14,18,-5,3,13,25],"MV":"9.9","RG":"2.9","CG":"8.9"};
        presets.push(preset7);

        preset8 = {"name":"Hells Bells","distoName":"standard","boost":false,"LCF":157,"HCF":17716,"K1":"2.5","K2":"2.5","K3":"5.0","K4":"5.0","F1":147,"F2":569,"F3":1915,"F4":4680,"Q1":"0.1","Q2":"0.6","Q3":"1.1","Q4":"0.1","OG":"4.5","BF":"5.0","MF":"5.0","TF":"5.0","PF":"5.0","EQ":[14,8,0,3,14,3],"MV":"0.5","RN":"Fender Hot Rod","RG":"2.0","CN":"Vintage Marshall 1","CG":"2.0"}
        presets.push(preset8);

        preset9 = {"name":"Smoke on the Water","LCF":298,"HCF":8703,"K1":"9.6","K2":"9.6","K3":"9.6","K4":"9.6","F1":300,"F2":1058,"F3":2297,"F4":7000,"Q1":2.5,"Q2":2,"Q3":0.6000000238418579,"Q4":0.4000000059604645,"OG":"4.5","BF":"4.0","MF":"8.5","TF":"3.8","PF":"3.1","EQ":[14,19,-7,-12,19,16],"MV":"1.8","RG":"1.6","CG":"10.0"};
        presets.push(preset9);

        preset10 = {"name":"Neat Neat Neat/Punk","distoName":"standard","LCF":184,"HCF":7000,"K1":"4.0","K2":"4.0","K3":"8.0","K4":"8.0","F1":71,"F2":300,"F3":3303,"F4":6210,"Q1":"2.5","Q2":"0.0","Q3":"17.2","Q4":"0.4","OG":"2.0","BF":"4.0","MF":"1.6","TF":"2.0","PF":"6.4","EQ":[-12,-12,-10,3,1,2],"MV":"10.0","RG":"3.4","CG":"5.4"};
        presets.push(preset10);

        preset11 = {"name":"Crunch 2","distoName":"standard","LCF":259,"HCF":12000,"K1":"2.0","K2":"2.0","K3":"3.9","K4":"3.9","F1":242,"F2":493,"F3":1780,"F4":4382,"Q1":"0.3","Q2":"12.6","Q3":"0.3","Q4":"2.8","OG":"10.0","BF":"8.1","MF":"4.5","TF":"2.9","PF":"9.8","EQ":[6,-5,-21,-3,-18,0],"MV":"8.2","RG":"1.2","CG":"8.7"}
        presets.push(preset11);

        preset12 = {"name":"Noisy 1","distoName":"NoisyHiGain","LCF":46,"HCF":9788,"K1":"0.9","K2":"0.9","K3":"1.9","K4":"1.9","F1":242,"F2":493,"F3":1200,"F4":3500,"Q1":"0.3","Q2":"0.0","Q3":"0.3","Q4":"0.0","OG":"3.2","BF":"7.4","MF":"6.7","TF":"5.2","PF":"4.8","EQ":[8,1,13,16,-12,-19],"MV":"6.6","RG":"0.0","CG":"7.5"}
        presets.push(preset12);

        preset13 = {"name":"Marshall Hi-Gain 2","distoName":"HiGainModern","LCF":200,"HCF":12000,"K1":"0.9","K2":"0.9","K3":"1.8","K4":"1.8","F1":147,"F2":569,"F3":1915,"F4":4680,"Q1":"0.0","Q2":"49.0","Q3":"42.0","Q4":"11.0","OG":"3.0","BF":"5.0","MF":"5.0","TF":"0.1","PF":"5.0","EQ":[-2,-1,0,3,1,3],"MV":"0.3","RG":"2.0","CG":"2.0"}
        presets.push(preset13);

        preset14 = {"name":"Clean 3","distoName":"smooth","LCF":200,"HCF":12000,"K1":"2.5","K2":"2.5","K3":"5.0","K4":"5.0","F1":242,"F2":493,"F3":1780,"F4":4382,"Q1":"0.3","Q2":"12.6","Q3":"0.3","Q4":"2.8","OG":"10.0","BF":"8.1","MF":"4.5","TF":"2.9","PF":"9.8","EQ":[6,-5,-21,-3,3,0],"MV":"9.8","RG":"3.7","CG":"4.6"}
        presets.push(preset14);

        preset15 = {"name":"ELectro Acoustic","distoName":"smooth","LCF":200,"HCF":12000,"K1":"2.5","K2":"2.5","K3":"5.0","K4":"5.0","F1":242,"F2":493,"F3":1780,"F4":4382,"Q1":"0.3","Q2":"12.6","Q3":"0.3","Q4":"2.8","OG":"10.0","BF":"8.1","MF":"4.5","TF":"2.9","PF":"9.8","EQ":[6,-5,-21,-3,3,0],"MV":"8.2","RG":"3.7","CG":"4.6"}
        presets.push(preset15);

        preset16 = {"name":"Heartbreak Riff","distoName":"standard","LCF":214,"HCF":15820,"K1":"4.1","K2":"4.1","K3":"8.2","K4":"8.2","F1":186,"F2":792,"F3":2402,"F4":4836,"Q1":"2.9","Q2":"0.7","Q3":"1.0","Q4":"1.0","OG":"0.8","BF":"4.8","MF":"6.0","TF":"5.9","PF":"8.9","EQ":[15,19,19,-2,17,-3],"MV":"2.1","RG":"1.2","CG":"7.4"}
        presets.push(preset16);

        preset17 = {"name":"Light My Knob","distoName":"superClean","LCF":256,"HCF":12000,"K1":"0.0","K2":"0.0","K3":"0.0","K4":"0.0","F1":147,"F2":569,"F3":2382,"F4":5696,"Q1":"0.0","Q2":"0.0","Q3":"0.0","Q4":"0.0","OG":"5.9","BF":"5.0","MF":"5.0","TF":"5.0","PF":"8.0","EQ":[-2,10,-10,-20,17,3],"MV":"6.5","RG":"2.0","CG":"6.7"}
        presets.push(preset17);

        preset18 = {"name":"Gainsbourgh Funk","distoName":"superClean","LCF":345,"HCF":18461,"K1":"0.4","K2":"0.4","K3":"0.7","K4":"0.7","F1":186,"F2":792,"F3":2402,"F4":6368,"Q1":"0.0","Q2":"23.7","Q3":"1.0","Q4":"1.0","OG":"6.6","BF":"8.0","MF":"1.3","TF":"5.9","PF":"10.0","EQ":[12,-2,-10,-20,2,11],"MV":"10.0","RG":"2.0","CG":"4.2"}
        presets.push(preset18);

        preset19 = {"name":"Revolution Beatles","distoName":"HiGainModern","LCF":200,"HCF":12000,"K1":"2.3","K2":"2.3","K3":"4.6","K4":"4.6","F1":147,"F2":569,"F3":1915,"F4":4680,"Q1":"1.9","Q2":"3.4","Q3":"4.2","Q4":"11.0","OG":"0.5","BF":"5.0","MF":"2.2","TF":"4.7","PF":"8.0","EQ":[-2,9,29,29,1,-3],"MV":"0.2","RG":"1.7","CG":"4.9"}
        presets.push(preset19);

        preset20 = {"name":"Noisy 2","distoName":"NoisyHiGain","LCF":289,"HCF":8720,"K1":"5.1","K2":"3.7","K3":"5.0","K4":"5.0","F1":91,"F2":548,"F3":1820,"F4":4535,"Q1":"4.3","Q2":"0.5","Q3":"0.3","Q4":"2.8","OG":"6.7","BF":"8.1","MF":"7.3","TF":"3.2","PF":"6.1","EQ":[9,-10,3,10,4,-17],"MV":"3.5","RG":"3.7","CG":"8.5"}
        presets.push(preset20);

        preset21 = {"name":"Highway to Hell","distoName":"fuzz","boost":true,"LCF":214,"HCF":15820,"K1":"0.9","K2":"0.3","K3":"4.2","K4":"1.3","F1":83,"F2":838,"F3":1694,"F4":5782,"Q1":"2.9","Q2":"1.7","Q3":"2.7","Q4":"1.0","OG":"0.8","BF":"4.8","MF":"6.0","TF":"5.9","PF":"8.9","EQ":[15,16,19,-2,17,-3],"MV":"2.1","RN":"Fender Hot Rod","RG":"0.0","CN":"Vintage Marshall 1","CG":"6.0"};
        presets.push(preset21);

        preset22 = {"name":"Love RnRoll","distoName":"smooth","boost":true,"LCF":214,"HCF":15820,"K1":"3.8","K2":"3.8","K3":"7.5","K4":"7.5","F1":186,"F2":792,"F3":2402,"F4":4836,"Q1":"2.9","Q2":"0.7","Q3":"1.0","Q4":"1.0","OG":"0.8","BF":"4.8","MF":"6.0","TF":"5.9","PF":"8.9","EQ":[15,19,19,-2,17,-3],"MV":"2.1","RN":"Fender Hot Rod","RG":"1.2","CN":"Vintage Marshall 1","CG":"7.4"};
        presets.push(preset22);

        presets.forEach(function (p, index) {
            var option = document.createElement("option");
            option.value = index;
            option.text = p.name;
            menuPresets.appendChild(option);
        });
        menuPresets.onchange = changePreset;
    }

    function changePreset() {
        setPreset(presets[menuPresets.value]);
    }

    function setPreset(p) {
        if(p.distoName === undefined) {
            p.distoName = "standard";
        }

        if(p.boost === undefined) p.boost = false;
        changeBoost(p.boost);

        changeLowCutFreqValue(p.LCF);
        changeHicutFreqValue(p.HCF);

        changeDistorsionValues(p.K1, 0);
        changeDistorsionValues(p.K2, 1);
        changeDistorsionValues(p.K3, 2);
        changeDistorsionValues(p.K4, 3);

        changeFreqValues(p.F1, 0);
        changeFreqValues(p.F2, 1);
        changeFreqValues(p.F3, 2);
        changeFreqValues(p.F4, 3);

        changeQValues(p.Q1, 0);
        changeQValues(p.Q2, 1);
        changeQValues(p.Q3, 2);
        changeQValues(p.Q4, 3);

        changeOutputGain(p.OG);

        changeBassFilterValue(p.BF);
        changeMidFilterValue(p.MF);
        changeTrebleFilterValue(p.TF);
        changePresenceFilterValue(p.PF);

        changeMasterVolume(p.MV);

        changeReverbGain(p.RG);
        changeReverbImpulse(p.RN);

        changeRoom(p.CG);
        changeCabinetSimImpulse(p.CN);

        changeEQValues(p.EQ);


       changeDistoTypeFromPreset(p.distoName);
    }

    function getPresets() {
        return presets;
    }

    function setDefaultPreset() {
        setPreset(preset1);
    }

    function printCurrentAmpValues() {
        var currentPresetValue = {
            name: 'current',
            distoName : currentDistoName,
            boost: boost.isActivated(),
            LCF: lowCutFilter.frequency.value,
            HCF: hiCutFilter.frequency.value,
            K1: getDistorsionValue(0),
            K2: getDistorsionValue(1),
            K3: getDistorsionValue(2),
            K4: getDistorsionValue(3),
            F1: filters[0].frequency.value,
            F2: filters[1].frequency.value,
            F3: filters[2].frequency.value,
            F4: filters[3].frequency.value,
            Q1: filters[0].Q.value.toFixed(1),
            Q2: filters[1].Q.value.toFixed(1),
            Q3: filters[2].Q.value.toFixed(1),
            Q4: filters[3].Q.value.toFixed(1),
            OG: (outputGain.gain.value*10).toFixed(1),
            BF: ((bassFilter.gain.value / 3) + 5).toFixed(1), // bassFilter.gain.value = (value-5) * 3;
            MF: ((midFilter.gain.value / 2) + 5).toFixed(1), // midFilter.gain.value = (value-5) * 2;
            TF: ((trebleFilter.gain.value / 5) + 5).toFixed(1), // trebleFilter.gain.value = (value-5) * 5;
            PF: ((presenceFilter.gain.value / 2) + 5).toFixed(1), // presenceFilter.gain.value = (value-5) * 2;
            EQ: eq.getValues(),
            MV: masterVolume.gain.value.toFixed(1),
            RN: reverb.getName(),
            RG: (reverb.getGain()*10).toFixed(1),
            CN: cabinetSim.getName(),
            CG: (cabinetSim.getGain()*10).toFixed(1)
       };

       console.log(JSON.stringify(currentPresetValue));
    }

    // END PRESETS

    function bypass(cb) {
        console.log("byPass : " + cb.checked);

        if (cb.checked) {
            // byPass mode
            inputGain.gain.value = 1;
            byPass.gain.value = 0;
        } else {
            // normal amp running mode
            inputGain.gain.value = 0;
            byPass.gain.value = 1;
        }

        // update buttons states
        //var onOffButton = document.querySelector("#myonoffswitch");
        var led = document.querySelector("#led");

        //onOffButton.checked = cb.checked;
        var onOffSwitch = document.querySelector("#switch1");
        if(cb.checked) {
            onOffSwitch.setValue(0,false);
            led.setValue(1, false);
        } else {
            onOffSwitch.setValue(1,false);
            led.setValue(0, false);
        }
    }

    function bypassEQ(cb) {
        console.log("EQ byPass : " + cb.checked);

        if (cb.checked) {
            // byPass mode
            inputEQ.gain.value = 1;
            bypassEQg.gain.value = 0;
        } else {
            // normal amp running mode
            inputEQ.gain.value = 0;
            bypassEQg.gain.value = 1;
        }

        // update buttons states
        //var onOffButton = document.querySelector("#myonoffswitch");
        var led = document.querySelector("#led");

        //onOffButton.checked = cb.checked;
        var eqOnOffSwitch = document.querySelector("#switch2");
        if(cb.checked) {
            eqOnOffSwitch.setValue(0,false);
        } else {
            eqOnOffSwitch.setValue(1,false);
        }
    }

    // API: methods exposed
    return {
        input: input,
        output: output,
        boostOnOff:boostOnOff,
        eq: eq,
        reverb: reverb,
        cabinet: cabinetSim,
        changeInputGainValue: changeInputGainValue,
        changeOutputGainValue:changeOutputGainValue,
        changeLowCutFreqValue: changeLowCutFreqValue,
        changeHicutFreqValue: changeHicutFreqValue,
        changeBassFilterValue : changeBassFilterValue,
        changeMidFilterValue : changeMidFilterValue,
        changeTrebleFilterValue : changeTrebleFilterValue,
        changePresenceFilterValue : changePresenceFilterValue,
        changeDrive: changeDrive,
        changeDistorsionValues: changeDistorsionValues,
        changeOversampling: changeOversampling,
        changeQValues: changeQValues,
        changeFreqValues: changeFreqValues,
        changeOutputGain: changeOutputGain,
        changeMasterVolume: changeMasterVolume,
        changeReverbGain: changeReverbGain,
        changeRoom: changeRoom,
        changeEQValues: changeEQValues,
        setDefaultPreset: setDefaultPreset,
        getPresets: getPresets,
        setPreset: setPreset,
        printCurrentAmpValues : printCurrentAmpValues,
        bypass: bypass,
        bypassEQ: bypassEQ
    };
}

var reverbImpulses = [
        {
            name: "Fender Hot Rod",
            url: "assets/impulses/reverb/cardiod-rear-levelled.wav"
        },
        {
            name: "PCM 90 clean plate",
            url: "assets/impulses/reverb/pcm90cleanplate.wav"
        },
        {
            name: "Scala de Milan",
            url: "assets/impulses/reverb/ScalaMilanOperaHall.wav"
        }
    ];
var cabinetImpulses = [
        {
            name: "Vintage Marshall 1",
            url: "assets/impulses/cabinet/Block%20Inside.wav"
        },
        {
            name: "Vox Custom Bright 4x12 M930 Axis 1",
            url: "assets/impulses/cabinet/voxCustomBrightM930OnAxis1.wav"
        },
        {
            name: "Fender Champ, axis",
            url: "assets/impulses/cabinet/FenderChampAxisStereo.wav"
        },
        {
            name: "Marshall 1960, axis",
            url: "assets/impulses/cabinet/Marshall1960.wav"
        }    
    ];
// ------- CONVOLVER, used for both reverb and cabinet simulation -------------------
function Convolver(context, impulses, menuId) {
    var convolverNode, convolverGain, directGain;
    // create source and gain node
    var inputGain = context.createGain();
    var outputGain = context.createGain();
    var decodedImpulse;

    var irDefaultURL = "assets/impulses/reverb/cardiod-rear-levelled.wav";
    var ir1 = "assets/impulses/reverb/pcm90cleanplate.wav";
    var ir2 = "assets/impulses/reverb/ScalaMilanOperaHall.wav";

    var menuIRs;
    var IRs = impulses;

    var currentImpulse = IRs[0];
    var defaultImpulseURL = IRs[0].url;

    convolverNode = context.createConvolver();
    convolverNode.buffer = decodedImpulse;

    convolverGain = context.createGain();
    convolverGain.gain.value = 0;

    directGain = context.createGain();
    directGain.gain.value = 1;

    buildIRsMenu(menuId);
    buildAudioGraphConvolver();
    setGain(0.2);
    loadImpulseByUrl(defaultImpulseURL);
    

    function loadImpulseByUrl(url) {
        // Load default impulse
        const samples = Promise.all([loadSample(context,url)]).then(setImpulse);
    }

    function loadImpulseByName(name) {
        if(name === undefined) {
            name = IRs[0].name;
            console.log("loadImpulseByName: name undefined, loading default impulse " + name);
        }

        var url="none";
        // get url corresponding to name
        for(var i=0; i < IRs.length; i++) {
            if(IRs[i].name === name) {
                url = IRs[i].url;
                currentImpulse = IRs[i];
                menuIRs.value = i;
                break;
            }
        }
        if(url === "none") {
            console.log("ERROR loading reverb impulse name = " + name);
        } else {
            console.log("loadImpulseByName loading " + currentImpulse.name);
            loadImpulseByUrl(url);
        }
    }

    function loadImpulseFromMenu() {
        var url = IRs[menuIRs.value].url;
        currentImpulse = IRs[menuIRs.value];
        console.log("loadImpulseFromMenu loading " + currentImpulse.name);
        loadImpulseByUrl(url);
    }

    function setImpulse(param) {
     // we get here only when the impulse is loaded and decoded
        console.log("impulse loaded and decoded");
        convolverNode.buffer = param[0];
        console.log("convolverNode.buffer set with the new impulse (loaded and decoded");
    }

    function buildAudioGraphConvolver() {
        // direct/dry route source -> directGain -> destination
        inputGain.connect(directGain);
        directGain.connect(outputGain);

        // wet route with convolver: source -> convolver 
        // -> convolverGain -> destination
        inputGain.connect(convolverNode);
        convolverNode.connect(convolverGain);
        convolverGain.connect(outputGain);
    }

    function setGain(value) {
        var v1 = Math.cos(value * Math.PI / 2);
        var v2 = Math.cos((1 - value) * Math.PI / 2);

        directGain.gain.value = v1;
        convolverGain.gain.value = v2;
    }

    function getGain() {
        return 2 * Math.acos(directGain.gain.value) / Math.PI;
    }

    function getName() {
        return currentImpulse.name;
    }


    function buildIRsMenu(menuId) {
        menuIRs = document.querySelector("#" + menuId);

        IRs.forEach(function (impulse, index) {
            var option = document.createElement("option");
            option.value = index;
            option.text = impulse.name;
            menuIRs.appendChild(option);
        });

        menuIRs.oninput = loadImpulseFromMenu;
    }
    //--------------------------------------
    // API : exposed methods and properties
    // -------------------------------------
    return {
        input: inputGain,
        output: outputGain,
        setGain: setGain,
        getGain: getGain,
        getName:getName,
        loadImpulseByName: loadImpulseByName
    };
}

// Booster, useful to add a "Boost channel"
var Boost = function(context) {
    // Booster not activated by default
    var activated = false;

    var input = context.createGain();
    var inputGain = context.createGain();
    inputGain.gain.value = 0;
    var byPass = context.createGain();
    byPass.gain.value = 1;
    var filter = context.createBiquadFilter();
    filter.frequency.value = 3317;
    var shaper = context.createWaveShaper();
    shaper.curve = makeDistortionCurve(640);
    var outputGain = context.createGain();
    outputGain.gain.value = 2;
    var output = context.createGain();

    // build graph
    input.connect(inputGain);
    inputGain.connect(shaper);
    shaper.connect(filter);
    filter.connect(outputGain);
    outputGain.connect(output);

    // bypass route
    input.connect(byPass);
    byPass.connect(output);

    function isActivated() {
        return activated;
    }

    function onOff(wantedState) {
        if(wantedState === undefined) {
            // do not boost
            if(activated) toggle();
            return;
        }
        var currentState = activated;

        if(wantedState !== currentState) {
            toggle();
        }
    }

    function toggle() {
        if(!activated) {
            byPass.gain.value = 0;
            inputGain.gain.value = 1;
        } else {
            byPass.gain.value = 1;
            inputGain.gain.value = 0;
        }
        activated = !activated;
    }

    function setOversampling(value) {
        shaper.oversample = value;
        console.log("boost set oversampling to " + value);
    }

    function makeDistortionCurve(k) {
        var n_samples = 44100; //65536; //22050;     //44100
        var curve = new Float32Array(n_samples);
        var deg = Math.PI / 180;
        for (var i = 0; i < n_samples; i += 1) {
            var x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }
    // API
    return {
        input:input,
        output:output,
        onOff: onOff,
        toggle:toggle,
        isActivated: isActivated,
        setOversampling: setOversampling
    };
};
 