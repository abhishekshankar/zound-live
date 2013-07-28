(function (models, modules, ui) {

  //~~~ MODELS

  var network = new zound.Network();
  var users = new zound.models.Users([ window.CURRENT_USER ]);

  var song = song_sample1();
  window._song = song; // for DEBUG only
  var pattern = song.patterns.first();

  var midiController = new models.MIDIController();

  var playerController = new models.PlayerController({
    length: song.get("length"),
    bpm: song.get("bpm")
  });
  song.on("change:length", function (song, length) {
    playerController.set("length", length);
  });
  song.on("change:bpm", function (song, bpm) {
    playerController.set("bpm", bpm);
  });
  playerController.setAudioContext(song.ctx);
  /*
  // FIXME: blur is too aggressive, we more need a "on tab change"
  $(window).blur(function () {
    playerController.stop();
  });
  */

  var availableModules = new models.Modules([
    new modules.Generator({ title: "Generator" }),
    new modules.Drum({ title: "Drum" }),
    new modules.MultiSynth({ title: "MultiSynth" }),
    new modules.Filter({ title: "Filter" }),
    new modules.Delay({ title: "Delay" }),
    new modules.Reverb({ title: "Reverb" })
  ]);

  availableModules.on("selectModule", function (module) {
    var m = module.clone();
    m.set("id", moduleId++);
    var title = m.get("title");
    if (title.length > 6) title = title.substring(0,5)+".";
    m.set("title", title+moduleId);
    song.modules.add(m);
  });

  //~~~ VIEWS 

  var midiControllerNotification = new ui.MIDIControllerNotification({
    model: midiController
  });
  $("#midiNotification").append(midiControllerNotification.el);

  var nodeEditor = new ui.NodeEditor({
    model: song,
    el: '#node-editor'
  });

  var tracker = new zound.ui.Tracker({
    model: pattern
  });
  $("#tracker").append(tracker.el);

  var player = new ui.Player({
    model: playerController
  });
  $('#toolbar').append(player.el);

  var moduleChooser = new ui.ModulesChooser({
    model: availableModules
  });
  $('#module-collection').append(moduleChooser.el);

  var currentPropertiesEditor;
  nodeEditor.on("selectModule", function (module) {
    CURRENT_USER.selectModule(module);
    if (currentPropertiesEditor) {
      currentPropertiesEditor.remove();
    }
    currentPropertiesEditor = new zound.ui.ModulePropertiesEditor({
      model: module
    });
    $('#module-properties').append(currentPropertiesEditor.el);
  });
  var m = song.modules.first();
  if (m) {
    nodeEditor.selectModule(m);
  }

  playerController.on("change:recording", function (model, recording) {
    if (recording && !CURRENT_USER.getSelectedSlot())
      CURRENT_USER.selectTrackerSlot(tracker.tracks[0].slots[0]);
  });
  playerController.on("tick", function (lineNumber, time) {
    song.scheduleNote(lineNumber, time);
    if(playerController.get("recording"))
      CURRENT_USER.moveTo(lineNumber);
    tracker.highlightLine(lineNumber);
  });
  playerController.on("change:playing", function (model, playing) {
    if (!playing)
      tracker.highlightLine(null);
  });

  // bind user style
  var users_style_template = _.template(document.getElementById('users_style_template').innerHTML);
  function updateUsersStyle (users) {
    $('#users_style').html(users.map(function (user) {
      return users_style_template(user.attributes);
    }).join('\n'));
  }
  users.on("add remove", function(user) {
    updateUsersStyle(users);
  });
  updateUsersStyle(users);


  var trackerIncrement = new zound.ui.TrackerIncrement({
    model: CURRENT_USER,
    id: "tracker-increment"
  });
  $('#tracker').append(trackerIncrement.el);

  var keyboardController = new zound.models.KeyboardController({
    user: CURRENT_USER
  });

  var handleNote = function (note) {
    var module = CURRENT_USER.getCurrentModule();
    var slot = CURRENT_USER.getSelectedSlot();

    if (module && module.canPlayNote())
      module.noteOn(note, song.ctx, song.ctx.currentTime);

    if (module && module.canPlayNote() && slot) {
      slot.model.set({
        note: note,
        module: module
      });
      CURRENT_USER.moveTrackerSelection(0, CURRENT_USER.get("trackerIncrement"));
    }
  };

  keyboardController.on("note", handleNote);
  midiController.on("note", handleNote);

  keyboardController.on({
    "note": handleNote,
    "unselect": function () {
      var slot = CURRENT_USER.getSelectedSlot();
      if (slot) {
        CURRENT_USER.unselectCurrentTrackerSlot();
      }
    },
    "play-pause": function () {
      if (!playerController.playing)
        playerController.play();
      else
        playerController.stop();
    }
  });

  // Handle selection
  (function(){
    /*
    var lastSelection = tracker.tracks[0].slots[0];
    $(window).on("keydown", function (e) {
      var slot = CURRENT_USER.getSelectedSlot();

      // Spacebar toggle the user tracker selection
      if (e.which===32) { // SPACE
        e.preventDefault();
        if (slot) {
          lastSelection = slot;
          CURRENT_USER.unselectCurrentTrackerSlot();
        }
        else {
          lastSelection && CURRENT_USER.selectTrackerSlot(lastSelection);
        }
        return;
      }

      if (e.which==8) { // BACKSPACE
        e.preventDefault();
        if (slot) {
          slot.model.set({ note: null, module: null });
          CURRENT_USER.moveTrackerSelection(0, -1);
        }
        return;
      }

      if (e.which==46 && slot) { // DELETE
        if (slot) {
          e.preventDefault();
          slot.model.set({ note: null, module: null });
          CURRENT_USER.moveTrackerSelection(0, CURRENT_USER.get("trackerIncrement"));
        }
        return;
      }

      var incrX = 0, incrY = 0;
      switch (e.which) {
        case 37: // left
          incrX = -1;
          break;
        case 39: // right
          incrX = 1;
          break;
        case 38: // up
          incrY = -1;
          break;
        case 40: // down
          incrY = 1;
          break;
      }
      if ((incrX || incrY) && slot) {
        e.preventDefault();
        CURRENT_USER.moveTrackerSelection(incrX, incrY);
      }
    });
    */
  }());

  // INITIALIZES NETWORK

  pattern.tracks.each(function(track){

    track.slots.each(function(slot){
      slot.on("change", function(slot){
        var note = slot.get("note");
        var module = slot.get("module");
        if(note === null){
          network.send("del-note", {
            slot: slot.get("num"),
            track: track.get("num")
          });
        }
        else {
          network.send("add-note", {
            slot: slot.get("num"),
            track: track.get("num"),
            note: note,
            module: module.id
          });
        }
      });
    });

  });

  function bindModule (module) {
    module.properties.each(function (property, i) {
      property.on("change", function (property) {
          network.send("property-change", {
            module: module.cid,
            property: i,
            value: property.get("value")
          });
      });
    });
  }

  song.modules.each(bindModule);
  song.modules.on("add", bindModule);

  network.send("user-connect", {
    user: window.CURRENT_USER.id
  });

  network.on("user-connect", function(o){
    console.log(o.data.user+" CONNECTED");
    var user = new zound.models.User({ id: o.data.user });
    users.add(user);
  });


  CURRENT_USER.on("user-select-slot", function(slot, track){
    network.send("user-select-slot", {
      "slot" : slot,
      "track" : track
    });
  });
  network.on("user-select-slot", function(o){
    var user = users.get(o.user);
    var slot = tracker.tracks[o.data.track].slots[o.data.slot];
    user.selectTrackerSlot(slot);
  });

  CURRENT_USER.on("user-unselect-slot", function () {
    network.send("user-unselect-slot");
  });
  network.on("user-unselect-slot", function(o){
    var user = users.get(o.user);
    user.unselectCurrentTrackerSlot();
  });

  network.on("add-note", function(o){
    var note = o.data.note
      , module = song.modules.get(o.data.module);
    var slot = tracker.tracks[o.data.track].slots[o.data.slot].model;
    slot.set({
      note: note,
      module: module
    });
  });

  network.on("del-note", function(o){
    var slot = tracker.tracks[o.data.track].slots[o.data.slot].model;
    slot.set({
      note: null,
      module: null
    });
  });
  // bind Network
  song.modules.on("add", function(module) {
      var data = module.toJSON();
      data.properties = module.properties.toJSON();
      network.send("add-module", data);
  });

  network.on("add-module", function(o) {
      var m = new modules[o.data.moduleName](o.data);
      song.modules.add(m);
  });

  var bindModuleNetwork = function (module) {
      module.on("change", function (module) {
          var data = modules.toJson()
          data.cid = module.cid
          network.send("change-module", data)
      })
  }

  network.on("change-module", function (data) {
      song.modules.find(function (e) {
          return e.cid == data.cid
      })
  })

  network.on("property-change", function(o) {
    var module = song.modules.get(o.data.module)
        ,propertyIdx = o.data.property
        ,value = o.data.value;

    var property = module.properties.at(propertyIdx);
    property.set("value", value);
  });

}(zound.models, zound.modules, zound.ui));
