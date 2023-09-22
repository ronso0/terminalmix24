/****************************************************************
*       Reloop Terminal Mix MIDI controller script v2.1         *
*           Copyright (C) 2012-2013, Sean M. Pappalardo         *
*                         2018, ronso0 (2.1 update)             *
*       but feel free to tweak this to your heart's content!    *
*       For Mixxx version 2.1.x                                 *
*                                                               *
*       Documentation in the Mixxx wiki:                        *
*       https://mixxx.org/wiki/doku.php/reloop_terminal_mix     *
****************************************************************/

function TerminalMix() {};

// ----------   Customization variables ----------

// ----------   Other global variables    ----------
// read this to prevent error messages for deck 3/4 output bindings
// when using a 2-deck skin like Shade
// https://bugs.launchpad.net/mixxx/+bug/1843649
var numDecks = engine.getValue("[App]","num_decks");
var numSamplers = engine.getValue("[App]","num_samplers");

var bpmStartValue = [null];
var defaultBeatjumpSize = 16;
var loopLength = [null];
TerminalMix.loopControlsVisible = false;


// scratch parameters
var alpha = 1.0/8;
var beta = alpha/32;
// threshold for BPM wheel moves
var wheelTurnThreshold = 7;

// brake & softStart
var breakFactor = 0.5;
var startFactor = 3.0;

// longpress timers & parameters
TerminalMix.state = [];
TerminalMix.timers = [];
TerminalMix.loadButtonTimers = []; // decks + samplers
TerminalMix.hotcueTimers = [];
TerminalMix.beatsKnobTimers = [];
TerminalMix.loopLengthTimers = [];
TerminalMix.loopInTimers = [];
TerminalMix.loopOutTimers = [];
// TerminalMix.loopMarkerMoveFactor = 1;

TerminalMix.shift = false;
TerminalMix.shiftL = false;
TerminalMix.shiftR = false;

TerminalMix.traxKnobPressed = false;

TerminalMix.loadButtonLongPressed = []; // decks + samplers
TerminalMix.hotcueLongPressed = [];
TerminalMix.beatsKnobLongPressed = [];
TerminalMix.loopLengthLongPressed = [];
TerminalMix.loopMovePressedL = false;
TerminalMix.loopMovePressedR = false;
TerminalMix.loopInLongPressed = [];
TerminalMix.loopOutLongPressed = [];

TerminalMix.beatsKnobPressed = [false];

TerminalMix.cloneMode = false;
TerminalMix.cloneSource = null;

TerminalMix.otherTrackMenuClosed = false;

//var fxAssignMode = false;

// ----------   Functions   ----------

TerminalMix.init = function (id,debug) {
    TerminalMix.id = id;

    console.log("-------------------");
    console.log("-------------------");
    console.log("-------------------");
    console.log("-------------------Num decks:" + numDecks);
    console.log("-------------------");
    console.log("-------------------");
    console.log("-------------------");
    // Extinguish all LEDs
    for (var i=0; i<=3; i++) {
        for (var j=1; j<=120; j++) {
            midi.sendShortMsg(0x90+i,j,0x00);
        }
    }

    // hide menubar
    engine.setValue("[Controls]","show_menubar",0);

    for (var i=1; i<=4; i++) {  // 4 decks, 4 effect units, 4 aux/mic
        // must have for a 4-deck controller !!
        var group = "[Channel" + i + "]";
        TerminalMix.loadButtonLongPressed[group] = false;
        TerminalMix.beatsKnobLongPressed[group] = false;
        TerminalMix.loopLengthLongPressed[group] = false;
        TerminalMix.loopInLongPressed[group] = false;
        TerminalMix.loopOutLongPressed[group] = false;

        engine.setValue(group,"volume",0);
        engine.softTakeover(group,"rate",1);

        engine.setValue(group,"beatjump_size",defaultBeatjumpSize);
        engine.setValue(group, "quantize", 0);
        engine.softTakeover("[EffectRack1_EffectUnit"+i+"]", "mix", 0);
        engine.setValue("[EffectRack1_EffectUnit"+i+"]", "mix", 1);
        engine.setValue("[QuickEffectRack1_[Channel"+i+"]]", "enabled", 0);
        // remember to twist Fx Mix knobs after startup

        // turn off mic + aux
        var j = i;
        if (i == 1) { j = ""; } // exception for Aux1 and Mic1
        engine.setValue("[Microphone"+j+"]","talkover",0);
        engine.setValue("[Auxiliary"+i+"]","main_mix",0);

        // TODO -- components??
        // connect deck controls:
        // * play controls
        // * hotcues
        // * samplers
        // * Load buttons
        // * Pfl buttons
    }
    engine.setValue("[Master]","talkoverDucking",0);

    // set fx focus
    engine.setValue("[EffectRack1_EffectUnit1]","has_controller_focus",1);
    engine.setValue("[EffectRack1_EffectUnit2]","has_controller_focus",1);
    engine.setValue("[EffectRack1_EffectUnit3]","has_controller_focus",0);
    engine.setValue("[EffectRack1_EffectUnit4]","has_controller_focus",0);

    engine.softTakeover("[Master]","crossfader",true);

    // setup of some LED flash timers
    // TODO Hook up to
    // [Master],indicator_250millis
    // [Master],indicator_500millis
    TerminalMix.timers["one50ms"] = engine.beginTimer(150, function() {TerminalMix.one50ms()});
    TerminalMix.timers["qtrSec"] = engine.beginTimer(250, function() {TerminalMix.qtrSec();});
    TerminalMix.timers["halfSec"] = engine.beginTimer(500,function() {TerminalMix.halfSec();});

    // Prepare samplers
    for (var i=numSamplers; i>=1; i--) {
        var sampler = "[Sampler"+i+"]";
        engine.setParameter(sampler,"volume",0);
        // false so SamplerVol knob instantly affects all samplers
        engine.softTakeover(sampler,"volume",false);
        engine.setValue(sampler,"pfl",0);
    }


    // print ("Reloop TerminalMix: "+id+" initialized.");
    console.log("Reloop TerminalMix: "+id+" initialized.");
}

TerminalMix.shutdown = function () {
    // Stop all timers
    for (var i=0; i<TerminalMix.timers.length; i++) {
        engine.stopTimer(TerminalMix.timers[i]);
    }
    for (var i=0; i<TerminalMix.loadButtonTimers.length; i++) {
        engine.stopTimer(TerminalMix.loadButtonTimers[i]);
    }
    for (var i=0; i<TerminalMix.loopLengthTimers.length; i++) {
        engine.stopTimer(TerminalMix.loopLengthTimers[i]);
    }

    // Extinguish all LEDs
    for (var i=0; i<=3; i++) {  // 4 decks
        for (var j=1; j<=120; j++) {
            midi.sendShortMsg(0x90+i,j,0x00);
        }
    }
    console.log("Reloop TerminalMix: "+TerminalMix.id+" shut down.");
}

// Touching the wheel plate enables scratching
TerminalMix.wheelTouch = function (channel, control, value, status, group) {
    var deck = script.deckFromGroup(group);
    if (value) { // touch
        // var alpha = 1.0/8;
        // var beta = alpha/32;
        engine.scratchEnable(deck, 800, 33+1/3, alpha, beta);
    } else { // release
        engine.scratchDisable(deck);
    }
}

// Jog wheel handler for scratching, nudging and loop moves
TerminalMix.wheelTurn = function (channel, control, value, status, group) {
    var deck = script.deckFromGroup(group);
    var wheelTicks = (value - 64);
    var loopEditmode = false;
    if (TerminalMix.loopInLongPressed[group] == true) {
        // move loop_in marker
        engine.setValue(group, "loop_start_position",
            engine.getValue(group, "loop_start_position") + (wheelTicks * loopMarkerMoveFactor));
        loopEditmode = true;
    }
    if (TerminalMix.loopOutLongPressed[group] == true) {
        // move loop_in marker
        engine.setValue(group, "loop_end_position",
            engine.getValue(group, "loop_end_position") + (wheelTicks * loopMarkerMoveFactor));
        loopEditmode = true;
    }
    if (loopEditmode) {
        return;
    }

    if (engine.isScratching(deck)) {
        // If we're scraching register the movement
        engine.scratchTick(deck, wheelTicks);
    } else {
        // else do wheel jog.
        engine.setValue(group, "jog", wheelTicks / 4);
    }
}

// Adjust BPM +/-1 with Shift + JogWheel turn.
// Slow tracks down to 0 BPM, no negative values (play backwards)
TerminalMix.BPMwheel = function (channel, control, value, status, group) {
    var currentBPM = engine.getValue(group,"bpm");
    // If no start value is given from last turn step, set it to zero
    if (!bpmStartValue[group]) {
        bpmStartValue[group] = 0;
    }
    // When turned clockwise
    if (value - 64 > 0) {
        bpmStartValue[group] = bpmStartValue[group] + 1;
    }
    // anti-clockwise
    else {
        bpmStartValue[group] = bpmStartValue[group] - 1;
    }

    // if we've overcome the threshold ...
    if (bpmStartValue[group] > wheelTurnThreshold) {
        // Increase BPM
        engine.setValue(group, "bpm", currentBPM + 1);
        bpmStartValue[group] = null;
    } else if (bpmStartValue[group] <-wheelTurnThreshold && currentBPM > 1) {
        // decrease BPM
        // Allow slowing down to 1, not below (play backwards).
        // Deck remains 'playing', so we can accelerate it again later.
        engine.setValue(group, "bpm", currentBPM - 1);
        bpmStartValue[group] = null;
    }
}


// reset key and pitch_adjust
// TerminalMix.beatsKnobPress = function (channel, control, value, status, group) {
//TerminalMix.keyChange = function (channel, control, value, status, group) {
TerminalMix.keyReset = function (channel, control, value, status, group) {
  if (value) {
      engine.setValue(group,"pitch",0);
      engine.setValue(group,"pitch_adjust",0);
      script.triggerControl(group,"reset_key",50);
  }
}


// reset key and pitch_adjust
// TerminalMix.beatsKnobPress = function (channel, control, value, status, group) {
//TerminalMix.keyChange = function (channel, control, value, status, group) {
TerminalMix.keyReset_BAK = function (channel, control, value, status, group) {
  // press
  if (value) {
      TerminalMix.beatsKnobLongPressed[group] = false;
      TerminalMix.beatsKnobPressed[group] = true;
      TerminalMix.beatsKnobTimers[group] = engine.beginTimer(
          750,
          function() {
              TerminalMix.beatsKnobLongPressed[group] = true;
              TerminalMix.beatsKnobTimers[group] = null;
          },
          true);
  // release
  } else {
      //TerminalMix.beatsKnobPressed[group] = false;
      // quick release
      if (TerminalMix.beatsKnobLongPressed[group] == false) {
          engine.stopTimer(TerminalMix.beatsKnobTimers[group]);
          TerminalMix.beatsKnobTimers[group] = null;
          // ronso0: test ultimate key/pitch reset with 'reset_key' first
          script.triggerControl(group,"reset_key",100);
          engine.setValue(group,"pitch",0);
          engine.setValue(group,"pitch_adjust",0);
      // Longpress release
      } else {
          TerminalMix.beatsKnobLongPressed[group] = false;
      }
  }
}

// Beats knob changes key manually
TerminalMix.beatsKnobTurn = function (channel, control, value, status, group) {
  // Beats knob not pressed = fast key change
  if (!TerminalMix.beatsKnobLongPressed[group]) {
      if (value === 65) {
          script.triggerControl(group,"pitch_up",50);
      }
      else if (value === 63) {
          script.triggerControl(group,"pitch_down",50);
      }
  // Beats knob pressed = slow key change
  } else {
      if (value === 65) {
          script.triggerControl(group,"pitch_up_small",50);
      }
      else if (value === 63) {
          script.triggerControl(group,"pitch_down_small",50);
      }
  }
}

// shifted Beats knob moves beatgrid
TerminalMix.shiftBeatsKnobTurn = function (channel, control, value, status, group) {
    if (value === 65) {
        script.triggerControl(group,"beats_translate_later",100);
    } else if (value === 63) {
        script.triggerControl(group,"beats_translate_earlier",100);
    }
}


// Shifted hotcue press
// short: activate saved loop(don't jump)
// long: delete cue
TerminalMix.hotcueShift = function (channel, control, value, status, group) {
    var index = control - 55;

    // return if no hotcue / loopcue is set
    if (engine.getValue(group, "hotcue_" + index + "_enabled") <= 0) {
      return;
    }

    if (value) { // press
        print("");
        print("   hotcueShift" + group + ":" + index + "pressed");
        TerminalMix.hotcueLongPressed[group, index] = false;
        TerminalMix.loopInTimers[group, index] = engine.beginTimer(
            500,
            function() {
                print("");
                print("   hotcueShift" + group + ":" + index + " longpressed");
                print("");
                TerminalMix.hotcueLongPressed[group, index] = true;
                TerminalMix.hotcueTimers[group, index] = null;
            },
            true);
    } else { // release
        print("");
        print("   hotcueShift" + group + ":" + index + "released");
        print("");
        if (TerminalMix.hotcueLongPressed[group, index] == true) {
            // longpress clears the cue
            script.triggerControl(group, "hotcue_" + index + "_clear", 100);
        } else {
            // shortpress activates loop
            script.triggerControl(group, "hotcue_" + index + "_cueloop", 100);
        }
        if (TerminalMix.hotcueTimers[group, index] !== null) {
            engine.stopTimer(TerminalMix.hotcueTimers[group, index]);
            delete TerminalMix.hotcueTimers[group, index];
        }
        TerminalMix.hotcueLongPressed[group, index] = false;
    }
}

// normal:  pitch slider
// shifted: randomize bpm within +-30% of track's original speed
//          helps to practice beat matching by ear
TerminalMix.pitchSlider = function(channel, control, value, status, group) {
    // normal
    if (!TerminalMix.shift) {
        engine.setValue(group,"rate",-script.midiPitch(control, value, status));
    // shifted
    } else {
        // // Use pitch slider's MSB/LSB value (-8191 - 8192) to generate
        // // a 'random' deck rate.
        // // Pitch range is +/-8%.
        // // I'd like to have maximum offset +/-2.5%, so with 8%,
        // // rate should be about +/-0.3 maximum
        // // var rateLimit = 0.5;
        // // Assuming that slider is only moved in above zero,
        // // we know that [ 0 < value < 1 ]
        // // ex. 0.68567877 */
        // // To get a random number, take second decimal
        // // and cut off everything above 'rateLimit'
        // valueX = script.midiPitch(control, value, status);
        // // console.log("     valueX = "+valueX);
        // for (var x=(valueX * 100); x > rateLimit;) {
        //     x = x - rateLimit;
        // }
        // console.log("     x     = "+x);
        // // So now we have [ 0 < x < rateLimit ], i.e. 0.356784
        // // Now we randomize rate direction, as well, by checking if it is
        // // below or above half of rateLimit.
        // if ( x > (rateLimit / 2) ) {
        //     var randomRate = -x;
        //     // ex. -0.356784
        // } else {
        //     var randomRate = x;
        //     // ex. 0.356784
        // }
        // console.log("     rate  = "+randomRate);
        // // finally, adopt 'randomRate' as new rate
        // engine.setValue(group,"rate",randomRate);
    }
}



TerminalMix.loopLengthPress = function (channel, control, value, status, group) {
  // Press
  if (value) {
      TerminalMix.loopLengthLongPressed[group] = false;
      if (!engine.getValue(group,"loop_enabled")) {
      // pseudo beatloop_roll:
            TerminalMix.loopLengthTimers[group] = engine.beginTimer(
                500,
                "TerminalMix.loopLengthLongpress(\""+group+"\")",
                true);
      //      engine.setValue(group, "slip_enabled", 1);
      //      script.triggerControl(group,"beatloop_2_activate",100);
      // traditional 4-beat loop:
          script.triggerControl(group,"beatloop_4_activate",100);
      } else {
          // exit loop
          script.triggerControl(group,"reloop_toggle",100);
      }
      // engine.setValue("[Skin]","show_loop_beatjump_controls",1);
  }
  // Release
  //  else {
    //    print("stop timer "+TerminalMix.loopLengthTimers[group]+"");
    //    engine.stopTimer(TerminalMix.loopLengthTimers[group]);
    //    delete TerminalMix.loopLengthTimers[group];
    //    // ToDo restore previous loop size
    //    engine.setValue(group,"beatloop_size",loopLength[group]);
    //    // disable slip mode if this was a long press
    //    engine.setValue(group, "slip_enabled", 0);
    //    if (TerminalMix.loopLengthLongPressed[group] === true) {
    //        script.triggerControl(group,"reloop_toggle",100);
    //    } else {
    //      statuscript.triggerControl(group,"loop_double",100);
    //    }
  //  }
}

TerminalMix.shiftedLoopLengthPress = function (channel, control, value, status, group) {
  if (value) {
    // re-enable last loop.
    // either waits for the playposition to cross the loop-in point,
    // or jumps back to loop-in point if play position is past the loop-out point.
    script.triggerControl(group,"reloop_toggle",100);
  }
}

TerminalMix.loopLengthTurn = function (channel, control, value, status, group) {
    if (value === 65) {
        script.triggerControl(group,"loop_double",100);
    }
    else if (value === 63) {
        script.triggerControl(group,"loop_halve",100);
    }
}

TerminalMix.loopMovePress = function (channel, control, value, status, group) {
    // TODO
    // fix & clean up

    /* This sets a boolean allowing to correctly interpret any turn of the loopmove encoder.
      As long as the encoder is pressed loop/beatjump are shown.
      All 4 encoders are mapped to this function so we need to find out on which side the
      controller is located. */
    var channelX = channel +1;
    var focusChannel = "loopLength"+channelX+"Focus";
    // console.log("    "+focusChannel + " [ " + value + " ] ");
    var left = false;
    if (channel === 1 || channel === 3) {
        left = true;
    }

    // press
    if (value) {
        // TerminalMix.loopControlsVisible = engine.getValue("[Skin]","show_loop_beatjump_controls");
        // if (channel === 1 || channel === 3) {
        if (left) {
            TerminalMix.loopMovePressedL = true;
        } else {
            TerminalMix.loopMovePressedR = true;
        }
        // engine.setValue("[Tango]",focusChannel,1);
        // console.log("    [Tango],"+focusChannel+",1");
        // show loop controls after 'loopMovePressed' status is set
        // engine.setValue("[Skin]","show_loop_beatjump_controls",1);
    // release
    } else {
        if (left) {
            TerminalMix.loopMovePressedL = false;
        } else {
            TerminalMix.loopMovePressedR = false;
        }
        // show loop controls after 'loopMovePressed' status is set
        // engine.setValue("[Skin]","show_loop_beatjump_controls",TerminalMix.loopControlsVisible);

        // engine.setValue("[Tango]",focusChannel,0);
        // console.log("    [Tango],"+focusChannel+",0");
    }
}

TerminalMix.loopMoveTurn = function (channel, control, value, status, group) {
    var leftChannel = false;
    var rightChannel = true;
    if (channel === 1 || channel === 3) {
        leftChannel = true;
        rightChannel = false;
    }
    // LoopMove pressed: change beatjump_size
    if ((leftChannel && TerminalMix.loopMovePressedL)
      || (rightChannel && TerminalMix.loopMovePressedR)) {
        TerminalMix.setBeatjumpSize(group, value);
    // loopmove / beatjump
    } else {
        TerminalMix.loopMoveBeatJump(group, value);
    }
}

TerminalMix.shiftedLoopMoveTurn = function(channel, control, value, status, group) {
  if (value === 65) {
      script.triggerControl(group,"beatjump_forward",100);
  } else if (value === 63) {
      script.triggerControl(group,"beatjump_backward",100);
  }
}

TerminalMix.loopMoveBeatJump = function (group, value) {
  // Loop enabled
  if (engine.getValue(group,"loop_enabled") === 1) {
    if (engine.getValue(group,"quantize") === 1) {
    // With 'quantize' enabled the loop_in marker might not snap to the
    // beat we want, but to the next or previous beat.
    // So we move the loop by one beat.
        script.loopMove(group,value-64,1);
    } else {
    // With 'quantize' OFF we might have missed the sweet spot, so we probably
    // want to move the loop only by a fraction of a beat. Default = 1/8th beat
        script.loopMove(group,value-64,0.125);
    }
  // Loop disabled
  } else {
    // jump by 'beatjump_size' beats
    if (value === 65) {
        script.triggerControl(group,"beatjump_forward",100);
    }
    else if (value === 63) {
        script.triggerControl(group,"beatjump_backward",100);
    }
  }
}

TerminalMix.setBeatjumpSize = function(group, value) {
    if (value === 65) {
        engine.setValue(group,"beatjump_size",engine.getValue(group,"beatjump_size")*2);
    }
    else if (value === 63) {
        engine.setValue(group,"beatjump_size",engine.getValue(group,"beatjump_size")/2);
    }
}


// Move loop_in with the jog wheel:
// * loop is active and playing
// * hold loop_in
// * turn jog wheel to move marker
// * release loop_in
TerminalMix.loopIn = function (channel, control, value, status, group) {
    if (value) { // press
        // console.log(" ");
        // console.log("   LoopIn"+group+" pressed");
        // console.log(" ");
        TerminalMix.loopInLongPressed[group] = false;
        TerminalMix.loopInTimers[group] = engine.beginTimer(
            300,
            function() {
                // console.log(" ");
                // console.log("   Loop In"+group+" longpressed");
                // console.log(" ");
                TerminalMix.loopInLongPressed[group] = true;
                TerminalMix.loopInTimers[group] = null;
            },
            true);
    } else { // release
        if (TerminalMix.loopOutLongPressed[group] == false) {
            script.triggerControl(group, "loop_in", 100);
        }
        if (TerminalMix.loopInTimers[group] !== null) {
            engine.stopTimer(TerminalMix.loopInTimers[group]);
            delete TerminalMix.loopInTimers[group];
        }
        TerminalMix.loopInLongPressed[group] = false;
    }
}

TerminalMix.loopOut = function (channel, control, value, status, group) {
    if (value) {
      // console.log(" ");
      // console.log("   LoopOut"+group+" pressed");
      // console.log(" ");
      TerminalMix.loopOutLongPressed[group] = false;
      TerminalMix.loopOutTimers[group] = engine.beginTimer(
        300,
        function() {
            // console.log(" ");
            // console.log("   Loop Out"+group+" longpressed");
            // console.log(" ");
            TerminalMix.loopOutLongPressed[group] = true;
            TerminalMix.loopOutTimers[group] = null;
        },
        true);
    } else { // release
        if (TerminalMix.loopOutLongPressed[group] == false) {
            script.triggerControl(group, "loop_out", 100);
        }
        if (TerminalMix.loopOutTimers[group] !== null) {
            engine.stopTimer(TerminalMix.loopOutTimers[group]);
            delete TerminalMix.loopOutTimers[group];
        }
        TerminalMix.loopOutLongPressed[group] = false;
    }
}

// brake - slow down the track until full stop
TerminalMix.brake = function (channel, control, value, status, group) {
    // Start brake effect on button press, don't care about button release.
    // If you want the effect sto stop on release, just use
    // script.brake(channel, control, value, status, group);
    if (value) {
        // call engine directly:
        // enable when button is pressed, release is irrelevant. usage:
        // engine.brake(int deck, bool activate, double factor, double rate, double rampTo)
        // engine.brake(deck, enable/disable, decay factor, initial playback speed, final speed);
        //
        // call to common-controller-scripts.js:
        // script.brake = function(channel, control, value, status, group, factor)
        script.brake(channel, control, value, status, group, breakFactor);
    }
}

// softStart - accelerate stopped track until regular playback speed
TerminalMix.softStart = function (channel, control, value, status, group) {
  // Accelerate on button press, ignore release.
  if (value) {
    // call to common-controller-scripts.js:
    // script.softStart = function(channel, control, value, status, group, factor)
    script.softStart(channel, control, value, status, group, startFactor);
  }
}


// Link all sampler volume controls to the Sampler Volume knob
TerminalMix.SamplerVolume = function (channel, control, value, status, group) {
    for (var i=TerminalMix.num_samplers; i>=1; i--) {
        engine.setParameter("[Sampler"+i+"]","volume",
                          script.absoluteLin(value, 0.0, 1.0));
    }
}


// Sampler button
// short press load selected track from library to sampler
// If Load of deck1-4 is pressed: clone track from there
// long press: use deck as clone source. press another Sampler or deck Load button to clone
TerminalMix.loadCloneSampler = function (channel, control, value, status, group) {
  // press
  if (value) {
      TerminalMix.loadButtonLongPressed[group] = false;
      TerminalMix.loadButtonTimers[group] = engine.beginTimer(
          300,
          function() {
              TerminalMix.loadButtonLongPressed[group] = true;
              TerminalMix.loadButtonTimers[group] = null;
              TerminalMix.cloneMode = true;
              TerminalMix.cloneSource = group;
          },
          true);
  // release
  } else {
      // quick release
      if (TerminalMix.loadButtonLongPressed[group] == false) {
          engine.stopTimer(TerminalMix.loadButtonTimers[group]);
          TerminalMix.loadButtonTimers[group] = null;
          // load selected track if no other Load button is currently pressed
          if (TerminalMix.cloneMode == false) {
              script.triggerControl(group, "LoadSelectedTrack", 100);
          // clone from long-press group to short-press group
          } else {
              TerminalMix.cloneSourceNum = TerminalMix.cloneSource.substr(8, 1);
              // print("");
              // print("     TerminalMix.cloneSource: " + TerminalMix.cloneSource + " #" + TerminalMix.cloneSourceNum);
              // print("");
              switch (TerminalMix.cloneSource.substr(1, 7)) {
                  case "Channel":
                      engine.setValue(group,
                                "CloneFromDeck",
                                TerminalMix.cloneSourceNum);
                      break;
                  case "Sampler":
                      engine.setValue(group,
                                "CloneFromSampler",
                                TerminalMix.cloneSourceNum);
                      break;
              }
          }
      // Longpress release
      } else {
          // clear TerminalMix.cloneMode and TerminalMix.cloneSource after long-press release,
          // not after cloning: maybe we want to clone this deck to yet another deck
          TerminalMix.cloneMode = false;
          TerminalMix.cloneSource = null;
      }
      TerminalMix.loadButtonLongPressed[group] = false;
  }
}


// Load button
// short press: load track to deck
// long press:
//   * Trax knob changes star rating
//   * use deck as clone source. press another Sampler or deck Load button to clone
TerminalMix.loadCloneDeckStars = function (channel, control, value, status, group) {
    // press
    if (value) {
        // every regular press will close any open track menu
        // track pressed state via cloneMode, e.g. for TraxKnobPress > show track menu
        TerminalMix.loadButtonLongPressed[group] = false;
        TerminalMix.loadButtonTimers[group] = engine.beginTimer(
            300,
            function() {
                TerminalMix.loadButtonLongPressed[group] = true;
                TerminalMix.loadButtonTimers[group] = null;
                TerminalMix.cloneMode = true;
                TerminalMix.cloneSource = group;
            },
            true);
    // release
    } else {
        // if press just closed track menu/s that should be a discrete action,
        // so release does nothing
        if (TerminalMix.otherTrackMenuClosed == true) {
            TerminalMix.otherTrackMenuClosed = false;
            return;
        }

        // long press release
        if (TerminalMix.loadButtonLongPressed[group]) {
            // clear TerminalMix.cloneMode after longpress release, not after cloning.
            // maybe we want to clone this deck to yet another deck
            TerminalMix.cloneMode = false;
            TerminalMix.cloneSource = null;
        // quick release
        } else {
            engine.stopTimer(TerminalMix.loadButtonTimers[group]);
            TerminalMix.loadButtonTimers[group] = null;
            if (TerminalMix.cloneMode == false) {
                // load track if no other Load button is currently pressed
                script.triggerControl(group, "LoadSelectedTrack", 100);
                // engine.setValue(group,"pfl",1);
            } else {
                // clone from long-press group to short-press group
                TerminalMix.cloneSourceNum = TerminalMix.cloneSource.substr(8, 1);
                switch (TerminalMix.cloneSource.substr(1, 7)) {
                    case "Channel":
                        engine.setValue(group,
                                  "CloneFromDeck",
                                  TerminalMix.cloneSourceNum);
                        break;
                    case "Sampler":
                        engine.setValue(group,
                                  "CloneFromSampler",
                                  TerminalMix.cloneSourceNum);
                        break;
                }
            }
        }
        TerminalMix.loadButtonLongPressed[group] = false;
    }
}


// normal:  GoToItem / focus searchbar
// shifted: open/close library track menu
TerminalMix.traxKnobPress = function (channel, control, value, status, group) {
    // Note: no signal sent on press, only press+release on release
    // ignore release
    if (!value) {
        return;
    }
    // shifted: toggle the tracks menu
    if (TerminalMix.shift) {
        // close all deck track menus first
        // = shortcut to cancel all track menus
        for (var i=1; i<=4; i++) {
            if (engine.getValue("[Channel"+i+"]", "show_track_menu") == 1) {
                engine.setValue("[Channel"+i+"]", "show_track_menu", 0);
            }
        }
        script.toggleControl("[Library]","show_track_menu", 100);
    // normal
    } else {
        // A deck Load button is pressed:
        // press Trax to open that deck's track menu
        if (TerminalMix.cloneMode == true) {
            // console.log("     cloneMode" + TerminalMix.cloneSource);
            if (TerminalMix.cloneSource.substr(1, 7) == "Channel") {
                script.toggleControl(
                    TerminalMix.cloneSource, "show_track_menu");
            }
            return;
        }

        // if the tracks table has focus > move to search bar
        if (engine.getValue("[Library]","focused_widget") === 3) {
            engine.setValue("[Library]","focused_widget", "1");

        // other widgets focused (or none)
        } else {
            script.triggerControl("[Library]","GoToItem", 100);
            // Sorting the tracks table
            // https://manual.mixxx.org/2.4/en/chapters/appendix/mixxx_controls.html#control-[Library]-sort_column
            // Invert sorting of the current sort column:
            //script.toggleControl("[Library]", "sort_order");
            // Get/set the sort column
            //var sortColumn = engine.getValue("[Library","sort_column");
            // 1 artist, 2 title, 11 location, 15 BPM
            //engine.setValue("[Library],sort_column_toggle", sortColumn);
        }
    }
}

// normal:        move table/tree selection (normal)
// shift:         scroll fast in table/tree (shifted)
// Load pressed:  change star rating (Load button pressed)
TerminalMix.traxKnobTurn = function (channel, control, value, status, group) {
    // normal
    if (!TerminalMix.shift) {
        // Check if any Load button is pressed.
        // If so, change the deck's star rating.
        for (var i=1; i<=4; i++) {
            var group = "[Channel"+i+"]";
            if (TerminalMix.loadButtonLongPressed[group]) {
                var direction = (value > 64) ? "_up" : "_down";
                script.triggerControl(group, "stars"+direction, 50);
                return;
            } else {
                continue;
            }
        }
        // no Load button pressed
        engine.setValue("[Library]","MoveVertical", value-64);
    // shifted
    } else {
        engine.setValue("[Library]","ScrollVertical", value-64);
        //engine.setValue("[Playlist]","SelectPlaylist", value-64);
    }
}

// normal:  move focus forward
// shifted: move focus backward
TerminalMix.uiBackButton = function (channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (TerminalMix.shift) {
        engine.setValue(group,"MoveFocus", "-1");
    } else {
        engine.setValue(group,"MoveFocus", "1");
    }
}


// normal:  toggle stacked waveforms
// shifted: toggle main menubar
TerminalMix.uiWaveformsMenu = function (channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (!TerminalMix.shift) {
        script.toggleControl("[Skin]","show_waveforms");
    } else {
        script.toggleControl("[Controls]","show_menubar");
    }
}

// normal:  switch between 2/4 decks
// shifted: toggle samplers/parking decks
TerminalMix.ui4decksSamplers = function (channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (!TerminalMix.shift) {
        script.toggleControl("[Skin]","show_4decks");
    } else {
        script.toggleControl("[Samplers]","show_samplers");
    }
}

// normal:  toggle mixer
// shifted: toggle Mic / Aux
TerminalMix.uiMixerMicAux = function (channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (!TerminalMix.shift) {
        script.toggleControl("[Skin]","show_mixer");
    } else {
        script.toggleControl("[Microphone]","show_microphone");
    }
}

// normal:  toggle fx units
// shifted: toggle 2/4 fx units
TerminalMix.uiFX = function (channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (!TerminalMix.shift) {
        script.toggleControl("[EffectRack1]","show");
    } else {
        // TODO when switching to fx unit 3 or 4, enforce 4 fx units
        // var show4Decks = engine.getValue("[Skin]","show_4effectunits");
        // enforce showing the Fx rack when toggling 2/4 units
        engine.setValue("[EffectRack1]","show",1);
        script.toggleControl("[Skin]","show_4effectunits");
    }
}

TerminalMix.shiftButtonL = function (channel, control, value, status, group) {
    // press
    if (value) {
        // Use both Left and Right Shift for Fx
        TerminalMix.effectUnit13.shift();
        TerminalMix.effectUnit24.shift();
        TerminalMix.shiftL = true;
        TerminalMix.shift = true;
    // release
    } else {
        TerminalMix.effectUnit13.unshift();
        TerminalMix.effectUnit24.unshift();
        TerminalMix.shiftL = false;
        // When releasing check state of opposing Shift button.
        // Reset the 'global' Shift state only if both are released.
        if (TerminalMix.shiftR == false) {
            TerminalMix.shift = false;
        }
    }
}
TerminalMix.shiftButtonR = function (channel, control, value, status, group) {
    // press
    if (value) {
        TerminalMix.effectUnit13.shift();
        TerminalMix.effectUnit24.shift();
        TerminalMix.shiftR = true;
        TerminalMix.shift = true;
    // release
    } else {
        TerminalMix.effectUnit13.unshift();
        TerminalMix.effectUnit24.unshift();
        TerminalMix.shiftR = false;
        if (TerminalMix.shiftL == false) {
            TerminalMix.shift = false;
        }
    }
}

// Fx units instantiation via midi-components-0.0__main_ro.js
// Usage: new components.EffectUnit( [fxUnitNums], allowFocusWhenHidden )
//    allowFocusWhenParametersHidden
//    * pressing fx focus button automatically expands Fx units
//    = show fx focus buttons in colapsed units

// why is this at the end?

// EffectUnits 1/3
TerminalMix.effectUnit13 = new components.EffectUnit([1,3], true);
TerminalMix.effectUnit13.enableButtons[1].midi = [0x90, 0x07];
TerminalMix.effectUnit13.enableButtons[2].midi = [0x90, 0x08];
TerminalMix.effectUnit13.enableButtons[3].midi = [0x90, 0x09];
TerminalMix.effectUnit13.knobs[1].midi = [0xB0, 0x01];
TerminalMix.effectUnit13.knobs[2].midi = [0xB0, 0x02];
TerminalMix.effectUnit13.knobs[3].midi = [0xB0, 0x03];
// TerminalMix.effectUnit13.dryWetKnob.midi = [0xB0, 0x2B];
TerminalMix.effectUnit13.effectFocusButton.midi = [0x90, 0x0A];
TerminalMix.effectUnit13.init();

// EffectUnits 2/4
TerminalMix.effectUnit24 = new components.EffectUnit([2,4],true);
TerminalMix.effectUnit24.enableButtons[1].midi = [0x91, 0x07];
TerminalMix.effectUnit24.enableButtons[2].midi = [0x91, 0x08];
TerminalMix.effectUnit24.enableButtons[3].midi = [0x91, 0x09];
TerminalMix.effectUnit24.knobs[1].midi = [0xB1, 0x01];
TerminalMix.effectUnit24.knobs[2].midi = [0xB1, 0x02];
TerminalMix.effectUnit24.knobs[3].midi = [0xB1, 0x03];
// TerminalMix.effectUnit24.dryWetKnob.midi = [0xB1, 0x2B];
TerminalMix.effectUnit24.effectFocusButton.midi = [0x91, 0x0A];
TerminalMix.effectUnit24.init();




// ----------- LED Output functions -------------

TerminalMix.one50ms = function () {
    TerminalMix.playFromCueFlash();
}

TerminalMix.qtrSec = function () {
}

TerminalMix.halfSec = function () {
    TerminalMix.activeLoopFlash();
    TerminalMix.offsetKeyFlash();
}

// Flash loop_in/_out when loop is active
TerminalMix.activeLoopFlash = function () {
  TerminalMix.state["loopFlash"] =! TerminalMix.state["loopFlash"];
  var value, group;
  // use [App],num_decks here to avoid log spam with a 2-deck skin
  for (var i=1; i<=numDecks; i++) {
      value = 0x00;
      group = "[Channel"+i+"]";
      if (engine.getValue(group,"loop_enabled") && TerminalMix.state["loopFlash"]) {
          value = 0x7F;
      }
      // Don't send redundant messages
      if (TerminalMix.state[group+"loop"] === value) {
          continue;
      }
      TerminalMix.state[group+"loop"] = value;
      midi.sendShortMsg(0x90+i-1,0x0C,value);
      midi.sendShortMsg(0x90+i-1,0x0D,value); // when shift is pressed
  }
}

// Flash Beats/Tap LED when musical key is not the original value
TerminalMix.offsetKeyFlash = function () {
  TerminalMix.state["keyFlash"] =! TerminalMix.state["keyFlash"];
  var value, group;
  // use [App],num_decks here to avoid log spam with a 2-deck skin
  for (var i=1; i<=numDecks; i++) {
      value = 0x00;
      group = "[Channel"+i+"]";
      if (engine.getValue(group,"pitch") !== 0 && TerminalMix.state["keyFlash"]) {
      // if (engine.getValue(group,"reset_key") !== 1 && TerminalMix.state["keyFlash"]) {
          value = 0x7F;
      }
      // Don't send redundant messages
      if (TerminalMix.state[group+"keyFlash"] === value) {
          continue;
      }
      TerminalMix.state[group+"keyFlash"] = value;
      midi.sendShortMsg(0x90+i-1,0x01,value);
      midi.sendShortMsg(0x90+i-1,0x40,value); // when shift is pressed
  }
}

// Flash Play to indicate temp. playing from Cue or Hotcue
TerminalMix.playFromCueFlash = function () {
  TerminalMix.state["playFlash"] =! TerminalMix.state["playFlash"];
  var value, group;
  // use [App],num_decks here to avoid log spam with a 2-deck skin
  for (var i=1; i<=numDecks; i++) {
      value = 0x00;
      group = "[Channel"+i+"]";
      /* is the deck playing regularly? */
      if (engine.getValue(group,"play_indicator")==1) value = 0x7F;
      else {
          /* is the deck playing from cue/hotue? */
          if (engine.getValue(group,"play") !== 0 && !TerminalMix.state["playFlash"]) {
              value = 0x7F;
          }
      }
      // Don't send redundant messages
      if (TerminalMix.state[group+"playFlash"] === value) {
          continue;
      }
      TerminalMix.state[group+"playFlash"] = value;
      midi.sendShortMsg(0x90+i-1,0x25,value);
      midi.sendShortMsg(0x90+i-1,0x40,value); // when shift is pressed
  }
}

