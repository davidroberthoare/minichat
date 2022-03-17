var roomid = makeid(8);  //default
if(location.hash){
  roomid = location.hash.replace("#","");
}
else if(localStorage.roomname){
  roomid = localStorage.roomname;
  location.hash = roomid;
}
else{
  var answer = prompt("What is the room ID you are joining? (eg. 'my_room')");
  if (answer != null && answer != "") {
    answer = answer.replace(/\W/g, '');
    roomid = answer;
  }
  location.hash = roomid;
}
console.log("roomid", roomid);


var nickname = "A User";  //default
if(localStorage.nickname){  //use the stored one if it's there...
  nickname = localStorage.nickname;
}else{
  var answer = prompt("Please enter a nickname", "A Visitor");
  if (answer != null && answer != "") {
    nickname = answer;
  }
}

const avatar = "";


const userid = Math.random(); //for socket connection

const autostart = true; //urlParams.get('autostart');


// ......................................................
// ..................RTCMultiConnection Code.............
// ......................................................

var connection = new RTCMultiConnection();

connection.userid = userid;
connection.channel = roomid;

connection.extra = {
  nickname: nickname,
  avatar: avatar
};

// connection.iceServers = []; //start empty. get servers via ajax below...
connection.iceServers = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:stun.l.google.com:19302?transport=udp"
    ]
  }
];

/// make this room public
connection.publicRoomIdentifier = roomid;

connection.socketMessageEvent = "msg-" + roomid;

// keep room opened even if owner leaves
connection.autoCloseEntireSession = true;

// maximum 9 users are allowed to join single room
connection.maxParticipantsAllowed = 9;

// by default, socket.io server is assumed to be deployed on your own URL
// connection.socketURL = 'https://rtcmulticonnection.herokuapp.com:443/';
connection.socketURL = 'https://server.minichat.live:9001/';

connection.session = {
  audio: true,
  video: true,
  data: true
};

//DH ADDED - for quality limiting
connection.bandwidth = {
  audio: 30, // 50 kbps
  video: 100 // 256 kbps
};

connection.mediaConstraints = {
  audio: true,
  video: {
    mandatory: {
      minFrameRate: 5,
      maxFrameRate: 10,
      maxWidth: 320,
      maxHeight: 240
    },
    optional: []
  }
};

if (DetectRTC.browser.name === "Firefox") {
  connection.mediaConstraints = {
    audio: true,
    video: {
      frameRate: {
        min: 5,
        max: 10
      },
      width: 320,
      height: 240
    }
  };
}

connection.sdpConstraints.mandatory = {
  OfferToReceiveAudio: true,
  OfferToReceiveVideo: true
};

//SETUP UI
connection.videosContainer = document.getElementById("videos-container");

connection.onstream = function(event) {
  console.log("ONSTEREAM EVENT");
  // setVideoState('waiting');

  var existing = document.getElementById(event.streamid);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  event.mediaElement.removeAttribute("src");
  event.mediaElement.removeAttribute("srcObject");
  event.mediaElement.muted = true;
  event.mediaElement.volume = 0;

  var video = document.createElement("video");

  try {
    video.setAttributeNode(document.createAttribute("autoplay"));
    video.setAttributeNode(document.createAttribute("playsinline"));
  } catch (e) {
    video.setAttribute("autoplay", true);
    video.setAttribute("playsinline", true);
  }

  if (event.type === "local") {
    video.volume = 0;
    try {
      video.setAttributeNode(document.createAttribute("muted"));
    } catch (e) {
      video.setAttribute("muted", true);
    }
  }
  video.srcObject = event.stream;

  var mediaElement = getHTMLMediaElement(video, {
    title: "", //event.userid,
    // buttons: ['full-screen'],
    buttons: event.type === "local" ? ["mute-audio", "stop"] : ["mute-audio", "stop"],
    // buttons: (event.type === 'local') ? [] : ['stop'],
    // width: (event.type === 'local') ? width/2 : width,
    width: "100%",
    showOnMouseEnter: false,
    onStopped: function() {
      // disconnect with all users
      connection.getAllParticipants().forEach(function(pid) {
        connection.disconnectWith(pid);
      });

      // stop all local cameras
      connection.attachStreams.forEach(function(localStream) {
        localStream.stop();
      });

      // close socket.io connection
      connection.closeSocket();
    }
  });

  //add an attribute used for CSS styling
  if (event.type === "local") {
    try {
      mediaElement.setAttributeNode(document.createAttribute("local"));
    } catch (e) {
      mediaElement.setAttribute("local", true);
    }
  }

  if ($(".media-container").length > 1) {
    $(".media-container.placeholder").hide();
  }

  connection.videosContainer.appendChild(mediaElement);
  doLayout();

  setTimeout(function() {
    mediaElement.media.play();
  }, 5000);

  mediaElement.id = event.streamid;

  // if (event.type === 'local') {
  connection.socket.on("disconnect", function() {
    if (!connection.getAllParticipants().length) {
      // location.reload();
      console.log("DISCONNECT EVENT");
      setVideoState("disconnected");
    }
  });
  // }
};

connection.onstreamended = function(event) {
  var mediaElement = document.getElementById(event.streamid);
  if (mediaElement) {
    mediaElement.parentNode.removeChild(mediaElement);

    if ($(".media-container").length <= 1) {
      $(".media-container.placeholder").show();
    }
  }
  setVideoState("disconnected");
};

connection.onleave = function(event) {
    var remoteUserId = event.userid;
    var remoteUserFullName = event.extra.fullName;

    console.log(remoteUserFullName + ' left you.');
};


connection.onMediaError = function(e) {
  if (e.message === "Concurrent mic process limit.") {
    if (DetectRTC.audioInputDevices.length <= 1) {
      alert(
        "Please select external microphone. Check github issue number 483."
      );
      return;
    }

    var secondaryMic = DetectRTC.audioInputDevices[1].deviceId;
    connection.mediaConstraints.audio = {
      deviceId: secondaryMic
    };

    // document.getElementById('join-room').onclick();
  }
};

connection.onUserStatusChanged = function(event, dontWriteLogs) {
  if (!!connection.enableLogs && !dontWriteLogs) {
    console.log("USER_STATUS_CHANGED", event.userid, event.status);
    if (event.status == "online") {
      setVideoState("in-call");
    } else {
      setVideoState("waiting");
    }
  }
};

connection.onopen = function(event) {
  connection.send("welcome");
};

function sendChatMessage() {
  console.log("sendChatMessage");
  if ($("#text_input").val() != "") {
    var msg = $("#text_input").val();
    connection.send({ type: "chat_message", msg: msg });
    $("#text_input")
      .val("")
      .focus();

    addNewMessage("local", msg, userid, nickname, avatar);
  }
}

connection.onmessage = function(event) {
  console.log(event.userid + " sent: ", event);

  switch (event.data.type) {
    case "chat_message":
      if (event.data.msg != "") {
        addNewMessage(
          "remote",
          String(event.data.msg),
          event.userid,
          event.extra.nickname,
          event.extra.avatar
        );
      }
      break;

    default:
      console.log("nothing to do with that type");
  }
};

function addNewMessage(type, msg, m_userid, m_nickname, m_avatar) {
  //should contain e.userid, e.extra, and e.data.msg
  var m = "<div class='chat_msg chat_" + type + "'>";
  // m +=
    // "<img class='chat_avatar' src='/users/avatars/" +
    // m_avatar +
    // "'>";
  m += "<span class='chat_nickname'>" + m_nickname + "</span>";
  m += "<span class='chat_txt'>" + msg + "</span>";
  m += "</div>";
  $("#message_container").prepend(m);
  
  if(type=='remote'){
    $("#chat_open_close").css("color", "green");
    setTimeout(function(){
      $("#chat_open_close").css("color", "#00000060");
    },1000)
  }
  
}

function enterRoom() {
  if (roomid != "") {
    setVideoState("active");
    connection.openOrJoin(roomid, function(isRoomExist, roomid, error) {
      if (error) {
        // disableInputButtons(true);
        if (error === connection.errors.ROOM_NOT_AVAILABLE) {
          alert(
            "Whoops. This chatroom is closed at the moment. Please wait a few seconds and try again..."
          );
          return;
        }
        if (error === connection.errors.ROOM_FULL) {
          alert("Room is full.");
          return;
        }
        console.log("video error: ", error);
        // } else if (connection.isInitiator === true) {
      } else {
        //connected!
        console.log("ROOM JOINED");
        setVideoState("waiting");
      }
    });
  }
}

function setVideoState(state) {
  console.log("setting p2p video state", state);

  $("#overlay")
    .removeClass("active")
    .removeClass("error")
    .removeClass("waiting");
  $("#overlay").show();
  // $("#videos-container").hide();

  if (state == "disconnected") {
    //default
  } else if (state == "active") {
    $("#overlay").addClass("active");
  } else if (state == "waiting") {
    $("#overlay").addClass("waiting");
    $("#videos-container").show();
  } else if (state == "in-call") {
    $("#overlay").hide();
    $("#videos-container").show();
  } else if (state == "error") {
    $("#overlay").addClass("error");
  }
}

// detect 2G
if (
  navigator.connection &&
  navigator.connection.type === "cellular" &&
  navigator.connection.downlinkMax <= 0.115
) {
  console.log("2G is not supported. Please use a better internet service.");
}


$(window).on('resize orientationchange', function(){
  setTimeout(function() {doLayout()}, 100);
});

function doLayout(){
  var num = $(".media-container:visible").length;
  var orientation = (window.innerHeight > window.innerWidth) ? 'portrait' : 'landscape';
  console.log("adjusting layout for ", num, orientation);
  var rows = 1;
  var cols = 1;
  //for landscape
  if(orientation=='landscape'){
    if(num==2){ rows=1; cols=2; }
    if(num==3){ rows=1; cols=3; }
    if(num==4){ rows=2; cols=2; }
    if(num>=5){ rows=2; cols=3; }
    if(num>=7){ rows=2; cols=4; }
    if(num==9){ rows=3; cols=3; }
  }
  
  //for landscape
  else if(orientation=='portrait'){
    if(num==2){ rows=2; cols=1; }
    if(num==3){ rows=3; cols=1; }
    if(num==4){ rows=2; cols=2; }
    if(num>=5){ rows=3; cols=2; }
    if(num>=7){ rows=4; cols=2; }
    if(num==9){ rows=3; cols=3; }
  }
  
  var marginPercent = 3;
  var h=(100/rows) - marginPercent;
  var w=(100/cols) - marginPercent;
  $(".media-container").css("width", w+"%").css("height", h+"%")
}





$(document).ready(function() {
  // setVideoState("disconnected"); // set default look

  if (roomid) {
  //   console.log("document ready for roomID", roomid);
    
    $("#sharelink a").attr("href", "/room/#"+roomid).text("#"+roomid);
    enterRoom();
    
  } else {
    console.log("no roomid. doing nothing");
  }
  
  $( ".connectedSortable" ).sortable({
    connectWith: ".connectedSortable",
    cursor: "move", 
    cursorAt: { left: 50, top:50 }
  }).disableSelection();
    
});


// window.onkeyup = function(e) {
//   var code = e.keyCode || e.which;
//   if (code == 13) {
//     sendChatMessage();
//   }
// };

// for testing layout only...
$(document).on("keypress", function(e) {
    if (event.charCode == 43) { //plus
        $("#videos-container").append("<div class='media-container'>media</div>");
        setTimeout(doLayout, 50);
    }
    if (event.charCode == 95) { //minues
        $(".media-container").last().remove();
        setTimeout(doLayout, 50);
    }
});

$("#text_input").on("keypress", function(e) {
  if (event.charCode == 13) {
    sendChatMessage();
  }
});

$("#chat_open_close").click(function() {
  console.log("clicked");
  $("#chat_container").toggleClass("stashed");
  $("#videos-container").toggleClass("chatactive");
  $("#chat_open_close")
    .toggleClass("fa-comment")
    .toggleClass("fa-comment-slash");
});


//***** END DOCUMENT READY


function makeid(length) {
   var result           = '';
   var characters       = 'abcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}