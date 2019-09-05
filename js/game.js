/***********
 * The Needle In The Haystack, front-end
 * Drag the hays, and click the needle to win.
 * 
 * Author: Julien Busset
 * Licence: // TODO
 * 
 * Works with an API which records and gives scores. If you want to develop your
 * own front app with this API, please contact me.
 * 
 * Table of contents:
 *  0.    Constants, variables
 *  I.    Main Function
 *  II.   To handle draggable objects (hays, title)
 *  III.  Functions for hanlding the needle and the hays
 *      1. Creation
 *      2. Location
 *      3. Utils
 *      4. Reconstitution of a finish screen
 *  IV.   Timer handler and utils
 *  V.    Title
 *  VI.   Scores screen
 *  VII.  Ajax
 *  VIII. Finish Screen manager
 *      1. get the finish screen at the end of a game
 *      2. Reconstitution of a saved finish screen
 *  IX.   Canva utils
 *  X.    Other utils
 * 
 */
// constants
const HAY_HEIGHT = 10;
const HAY_WIDTH = 160;
const DELTA_TIMER = 34; // in ms (17 is for 60fps)
const DELTA_DRAGGING = 300; // in ms
const SCORES_RANGE = 5;
const PSEUDO_SIZE = 6;
const HAY_NUMBER = 200;
// prod
// const SITE_URL = "https://test.hyperbolicworld.fr/";
// const SITE_BASE_URI = "/"; // to extract numbers from URI
const SITE_URL = "http://localhost:8888/TNITH/front/";
const SITE_BASE_URI = "/TNITH/front/";
// prod
// const API_URL = "https://apitest.hyperbolicworld.fr/";
const API_URL = "https://127.0.0.1:8000/"
const IMG_DIR = "images/";
const NEEDLE_IMG_FILENAME = "needle.png";
const HAY_IMG_FILENAME = "hay.png";

// variables
var hayIdDispo = 0;
var hayNumber = HAY_NUMBER; // must be changed depending on device screen size

var mainHeight; // set after initialization
var mainWidth; // set after initialization

// for dragging
var dragged = undefined;
var draggingOffset = { x: 0, y: 0 };

// always on top
// never use it directly, use zIndexOnTop() instead for
// auto-increment
var zIndexOnTop = 1;

// for timer
var start;
var timeToWin;
var timerController;

// for dragging
var draggingCheck;

// for "please wait" spinner
var spinnerTimeout;

// begin screen and finish screen to save
var beginScreen = new Array();
var finishScreen = new Array();
var savedFS; // the one we got from AJAX, to transform into regular finishScreen

// for canvas
var fsWidth;
var fsHeight;

// images
var hayImg;
var needleImg;

/**********
 * I. Main function
 */
$(document).ready(function () {
    // general things

    // put the loading screen on top of the rest
    loading();

    // preload images (async)
    preloadImg();

    // to avoid blue selection
    $("#mainContainer").addClass("noselect");

    // get window's size and set mainContainer's size
    getWindowsSize();

    // check the URI
    var extractedId = extractURI(window.location.pathname);
    // if no id in the URI
    if (!Number.isInteger(extractedId)) {
        // play a new game
        letsplay();
    } else {
        // else, show the associated finish screen
        showIdFinishScreen(extractedId);
    }
});

// get window's size and set mainContainer size
function getWindowsSize() {
    mainWidth = window.innerWidth
        || document.documentElement.clientWidth
        || document.body.clientWidth;

    mainHeight = window.innerHeight
        || document.documentElement.clientHeight
        || document.body.clientHeight;

    // set window's size to mainContainer div
    $("#mainContainer").height(mainHeight);
    $("#mainContainer").width(mainWidth);
}

// starts a game
function letsplay() {
    // disable window resizing
    disableResizing();

    // stop overflow
    $("#mainContainer").css("overflow", "hidden");

    // creating haystack is quite heavy, so wait for it before doing what's next
    // (especially showing the needle ^^')
    createHaystack();

    // do things with title (draggable, on top,…)
    manageTitle();

    // handle dragging
    handleDraggables();

    // wait for the images are loaded to show it all
    allLoaded().then(function () {
        // wait that everything is on screen to build the needle and next
        $(window).one("load", function () {
            stopWaiting();
            createNeedle();

            // click the needle to win
            $("#needle").one("click touchstart", function () {
                timeToWin = Date.now() - start;
                clearInterval(timerController);
                displayFinalTime(); // to display it frame perfect!
                regAndDisplayScores();
                // on smartphones, the screen is reduced when you enter the name
                // due to the virtual keyboard
                enableResizing();
            });

            // Timer starts!
            prepareTimer();
            start = Date.now();
            timerRoutine();
        });
    });
}

// show the finish screen of given id
function showIdFinishScreen(id) {
    hideTitle(); // ?

    // get finish screen of given id
    getFSFromId(id).done(function (fs) {
        // and save it to reuse it when resizing the window
        savedFS = fs[0].finishscreen;

        // when images are loaded, recreate the finish screen
        allLoaded().then(function () {
            recreateFS();

            // make the canvas rescaling dynamically
            $(window).resize(function () {
                getWindowsSize();
                rescaleCanvas();
            });

            stopWaiting();
        });
    });
}

async function preloadImg() {
    titleImg = new Image();

    spinnerImg = new Image();

    needleImg = new Image();
    needleImg.onload = needleLoaded();
    needleImg.src = SITE_URL + IMG_DIR + NEEDLE_IMG_FILENAME;

    hayImg = new Image();
    hayImg.className = "hay draggable";
    hayImg.onload = hayLoaded();
    hayImg.src = SITE_URL + IMG_DIR + HAY_IMG_FILENAME;

    return allLoaded();
}

async function allLoaded() {
    return Promise.all([
        needleLoaded(),
        hayLoaded()
    ]);
}

function loading() {
    $(".title").css("zIndex", hayNumber + 1000);
    $(".pleaseWait").css("zIndex", hayNumber + 1001);
}

/******
 * II. to handle draggable objects (hays, title)
 * add the "draggable" class to make an object draggable
 */

function handleDraggables() {
    handleDraggedObject();
    draggingCheck = setInterval(function () {
        drag();
    }, DELTA_DRAGGING);
}

function handleDraggedObject() {
    // events support
    $(".draggable").on("mousedown touchstart", function (event) {
        event.preventDefault();
        dragged = $(event.target);

        // get pageX and pageY wether it's touch or mouse event
        var page = getPageXY(event);

        // put it on top of the stack
        dragged.css("zIndex", topZIndex());

        // to avoid discance between cursor and hay
        var offsetLeft = dragged.css("left");
        var offsetTop = dragged.css("top");
        draggingOffset = {
            x: offsetLeft.slice(0, offsetLeft.indexOf("p")) - page.x,
            y: offsetTop.slice(0, offsetTop.indexOf("p")) - page.y
        };
    });

    $(document).on("mouseup touchend touchcancel", function () {
        dragged = undefined;
    });

}

function drag() {
    $(document).on("mousemove touchmove", function (event) {
        var page = getPageXY(event);
        moveIt(page.x, page.y);
    });

    function moveIt(pageX, pageY) {
        if (dragged !== undefined) {
            var posX = Math.round(pageX + draggingOffset.x);
            var posY = Math.round(pageY + draggingOffset.y);
            dragged.css({
                "top": posY + "px",
                "left": posX + "px"
            });
        }
    }
}

/*******
 * III. Functions for hanlding the needle and the hays
 */
/******
 * * 1. Creation
 */
function createNeedle() {
    // create the DOM component
    createNeedleDOM($("#mainContainer"));

    // prepare to record it in the begin screen
    beginScreen["#needle"] = new HayOrNeedle();

    // move it to a random position (TODO : enlever la moitié de sa taille pour que ça soit bien visible)
    moveNeedleToRandomPosition();

    // turn it randomly
    rotateNeedleRandomly();

    // put it down in the haystack
    $("#needle").css("zIndex", 0);
}

function createHay() {
    // get available id
    var hayId = "hay" + hayIdDispo;
    hayIdDispo++; // don't forget to prepare next id

    // create the hay in DOM
    createHayDOM($("#mainContainer"), hayId);

    // update hay id for further use
    hayId = "#" + hayId;

    // prepare to record it in the begin screen
    beginScreen[hayId] = new HayOrNeedle();

    // move it to a random position
    moveHayToRandomPosition(hayId);

    // turn it randomly
    rotateHayRandomly(hayId);

    // put it on top of the stack
    $(hayId).css("zIndex", topZIndex());
}

function createHaystack() {
    for (var i = 0; i < hayNumber; i++) {
        createHay();
    }
}

function createNeedleDOM(container) {
    // prepare the preloaded image of needle
    needleImg.id = "needle";
    // create DOM
    container.append(needleImg);
}

function createHayDOM(container, hayId) {
    // check if given id begins with '#'
    // and remove it if it is
    if (hayId.charAt(0) == '#') {
        hayId = hayId.substr(1, hayId.length);
    }

    // prepare image (preloaded)
    hayImg.id = hayId;
    // create DOM (draggable class already added in preloadImg)
    container.append(hayImg.cloneNode());
}



/**********
 * * 2. Location
 */
function rotateNeedleRandomly() {
    rotateRandomly("#needle");
}

function rotateHayRandomly(id) {
    rotateRandomly(id);
}

function rotateRandomly(id) {
    var rAngle = Math.round(Math.random() * 360);

    rotateOf(id, rAngle);

    // save it in begin screen (also for finish screen)
    beginScreen[id].angle = rAngle;
}

function rotateOf(id, angle) {
    $(id).css({
        "-ms-transform": "rotate(" + angle + "deg)",
        "-webkit-transform": "rotate(" + angle + "deg)",
        "transform": "rotate(" + angle + "deg)"
    });
}

function moveNeedleToRandomPosition() {
    moveToRandomPosition("#needle", -HAY_HEIGHT, -HAY_WIDTH);
}

function moveHayToRandomPosition(id) {
    moveToRandomPosition(id, HAY_HEIGHT, HAY_WIDTH);
}

function moveToRandomPosition(id, heightAdjust, widthAdjust) {
    // increase the range for a good distribution
    var possHeight = mainHeight + heightAdjust;
    var possWidth = mainWidth + widthAdjust;

    // random number in this range
    var rTopOffset = Math.round(Math.random() * possHeight);
    var rLeftOffset = Math.round(Math.random() * possWidth);

    // shift of half of it to adjust
    rTopOffset -= heightAdjust / 2;
    rLeftOffset -= widthAdjust / 2;

    // apply the position changing (absolute, not relative, for overing)
    moveTo(id, rTopOffset, rLeftOffset);

    // save it in begin screen (also for finish screen)
    beginScreen[id].x = rLeftOffset;
    beginScreen[id].y = rTopOffset;
}

function moveTo(id, topOffset, leftOffset) {
    $(id).css({
        "position": "absolute",
        "top": topOffset + "px",
        "left": leftOffset + "px"
    });
}

/*******
 * * 3. Utils
 */
async function hayLoaded() {
    return Promise.resolve();
}

async function needleLoaded() {
    return Promise.resolve();
}


/**********
 * IV. Timer handler and utils
 */
function prepareTimer() {
    var timer = $(".timer");

    // timer positioning
    timer.css({
        "position": "absolute"
    });
    timer.html("00:00:00,000");
    var leftOffset = Math.round((mainWidth / 2) - (timer.width() / 2));
    timer.css({
        "bottom": "3%",
        "left": leftOffset
    });

    // make it visible above haystack
    timer.css({
        "zIndex": topZIndex()
    })

    // to be able to click through
    timer.addClass("noselect clickthrough");
}

function timerRoutine() {
    var timer = $(".timer");

    // timer control
    timerController = setInterval(function () {
        var timeList;
        if (typeof timeToWin === 'undefined') {
            timeList = timeCalculation(Date.now() - start);
        } else {
            timeList = timeCalculation(timeToWin);
        }

        timer.html(timeList["h"] + ":" + timeList["m"] + ":" + timeList["s"] + "." + timeList["ms"]);
    }, DELTA_TIMER); // update every DELTA_TIMER ms
}

function hideTimer() {
    $(".timer").hide();
}

function timeCalculation(time) {
    var ms = time % 1000;
    time = Math.floor(time / 1000);
    var s = time % 60;
    time = Math.floor(time / 60);
    var m = time % 60;
    time = Math.floor(time / 60);
    var h = time;


    // nice display with zeros
    ms = addZero(ms, 3);
    s = addZero(s, 2);
    m = addZero(m, 2);
    h = addZero(h, 2);

    return { "h": h, "m": m, "s": s, "ms": ms };
}

function displayFinalTime() {
    $(".timer").html(timeDisplay(timeToWin));
}

// utils for Timer()
function addZero(x, n) {
    while (x.toString().length < n) {
        x = "0" + x;
    }
    return x;
}

// to display time nicely from a ms sum
function timeDisplay(time) {
    var timeList = timeCalculation(time);
    return timeList["h"] + ":" + timeList["m"] + ":" + timeList["s"] + "." + timeList["ms"];
}

/******
 * V. Title
 */
function manageTitle() {
    // find it
    var title = $(".title");

    // put it where it's good to be
    centerDiv(title);
    title.css("bottom", "");
    title.css("top", "3%");
    title.css("padding", "0");

    // make it draggable
    title.addClass("draggable");
}

function hideTitle() {
    $(".title").hide();
}

/*********
 * VI. Scores screen
 */
function regAndDisplayScores() {
    // save final haystack + needle pos
    getFSFromScreen();

    // show modal div
    var modalScreen = $(".modal");
    modalScreen.css({
        "zIndex": topZIndex()
    });
    modalScreen.show();

    // display the screen to ask for pseudo (and congrats ^^')
    askForPseudoScreen();

    // get that screen
    var askPseudo = $(".askPseudo");

    // get the pseudo, and do what you have to
    var submitButton = askPseudo.find("button");
    var inputText = askPseudo.find("input:text[name='pseudo']");

    // do what you have to when the client submit
    function callbackWhenEvent() {
        submitButton.attr("disabled", "disabled");
        pleaseWait();
        var pseudo = inputText.val();
        registerScore(pseudo).done(function (id) {
            getScoresAroundId(id).done(function (jsonScores) {
                askPseudo.hide();
                hideTimer();
                displayScores(jsonScores);
                stopWaiting();
            });
        });
    }

    // previous function triggered when
    submitButton.one("click", function () {
        callbackWhenEvent();
    });
    inputText.on("keypress", function (event) {
        if (event.which == 13) {
            event.preventDefault();
            callbackWhenEvent();
        }
    });
}

function askForPseudoScreen() {
    // find it
    var askPseudo = $(".askPseudo");

    // fill it
    askPseudo.html('<p>You\'ve found the needle!</p>');
    askPseudo.append('<p>' + timeDisplay(timeToWin) + '</p>');
    var inputTextPrep = '<input class="textInput" type="text" name="pseudo" autofocus maxlength="' + PSEUDO_SIZE + '" size="' + PSEUDO_SIZE + 'em"';
    // for the placeholder
    inputTextPrep += ' placeholder="';
    for (i = 0; i < PSEUDO_SIZE; i++) {
        inputTextPrep += '_';
    }
    inputTextPrep += '"';
    inputTextPrep += '>';
    askPseudo.append(inputTextPrep);
    askPseudo.append('<br>');
    askPseudo.append('<button class="submitButton">Save record</button>');
    // a bit of css
    askPseudo.find(".submitButton").addClass("texte");
    askPseudo.find(".textInput").addClass("texte");


    // prepare it for display
    centerDiv(askPseudo);

    // display it
    askPseudo.show();
}

function registerScore(pseudo) {
    var score = {
        "time": timeToWin,
        "pseudo": pseudo,
        "finishscreen": finishScreenToJSON(finishScreen)
    };

    return regScore(score);
}

function displayScores(jsonScores) {
    // handle vars
    var sScreen = $(".scorescreen");
    var sLines = sScreen.find(".scorelines");
    var myRank = parseInt(jsonScores[0].rank);
    var myLine = parseInt(jsonScores[0].lineindex);
    var scores = jsonScores.slice(1);

    // get the number of figures in the rank, and fill with blanks the shorter ones
    var maxRankDigits = (myRank + SCORES_RANGE - 1 - myLine).toString().length;

    // make
    var lines = new Array(SCORES_RANGE);
    for (var i = 0; i < SCORES_RANGE; i++) {
        var rank = myRank + i - myLine;
        lines[i] = fillWithBlanks(rank.toString(), maxRankDigits, "before")
            + '. '
            + fillWithBlanks(scores[i].pseudo, PSEUDO_SIZE, "after")
            + ' '
            + timeDisplay(scores[i].time);
    }

    // fill
    sLines.html(''); // before
    for (var i = 0; i < SCORES_RANGE; i++) {
        var toAppend = '<pre';
        if (i == myLine) {
            toAppend += ' class="myLine" ';
        }
        toAppend += '>' + lines[i] + '</pre>';
        sLines.append(toAppend);
    }
    sLines.append('<pre>Support this game at Patreon</pre>'); // after
    sLines.append('<p>refresh page to start a new game</p>'); // after

    // prepare display at center
    centerDiv(sScreen);

    // display
    sScreen.show();
}

/***********
 * VII. Ajax
 */
function regScore(score) {
    return $.ajax({
        method: "POST",
        url: API_URL + "score",
        data: JSON.stringify(score)
    });
}

function getScoresAroundId(id) {
    return $.ajax({
        method: "GET",
        url: API_URL + "score/" + id
    });
}

function getFSFromId(id) {
    var jsonResponse = $.ajax({
        method: "GET",
        url: API_URL + "finishscreen/" + id,
    });

    return jsonResponse;
}

/**********
 * VIII. Finish screen manager
 * * 1. get the finish screen at the end of a game
 */
class HayOrNeedle {
    constructor(id, posX, posY, angle, zIndex) {
        this.id = id;
        this.x = posX;
        this.y = posY;
        this.angle = angle;
        this.zIndex = zIndex;
    }
}

function getFSFromScreen() {
    // manage needle
    getNeedleFromScreen();

    // manage hays
    for (var i = 0; i < hayNumber; i++) {
        getHayFromScreen(i);
    }
}

function getItemFromScreen(id) {
    // to get the properties, we need to get them in the style attribute using regex,
    // because the positions and angles are not easily readable
    // this is not very robust, but it's the quickest
    var nStyle = $(id).attr("style");

    var posY = extractFromString(nStyle, "top: ", "px;");
    var posX = extractFromString(nStyle, "left: ", "px;");
    var angle = extractFromString(nStyle, "rotate\(", "deg\)");
    var zIndex = extractFromString(nStyle, "z-index: ", ";");

    return new HayOrNeedle(id, posX, posY, angle, zIndex);
}

function getNeedleFromScreen() {
    finishScreen.push(getItemFromScreen("#needle"));
}

function getHayFromScreen(index) {
    var id = "#hay" + index;
    finishScreen.push(getItemFromScreen(id));
}


/*******
 * * 2. Reconstitution of a saved finish screen
 */
function recreateFS() {
    // init finish screen if needed
    finishScreen = new Array();
    // save fs size and recreate finish screen
    $.each(savedFS, function (index, item) {
        if (item.id == "main") {
            fsWidth = item.mainWidth;
            fsHeight = item.mainHeight;
        } else {
            // rearrange in the order of z-index
            // to ease drawing order in the canvas
            // (in DOM order, built in zIndex order)
            finishScreen[item.zIndex] = getItemFromSavedFS(item);
        }
    });

    // calculate scaling ratio to fit the window
    // (max factor from width and height rescale)
    var heightRatio = mainHeight / fsHeight;
    var widthRatio = mainWidth / fsWidth;
    var ratio = Math.min(heightRatio, widthRatio);

    // make the canvas from finish screen
    makeCanvas(finishScreen, fsWidth, fsHeight);
}

function recreateNeedle(needle) {
    recreateItem(needle, NEEDLE_IMG_FILENAME);
}

function recreateHay(hay) {
    recreateItem(hay, HAY_IMG_FILENAME);
}

function recreateItem(item, imgFilename) {
    drawItemInCanvas(item, imgFilename);
}


function getItemFromSavedFS(item) {
    var id = item.id;
    var posX = item.x;
    var posY = item.y;
    var angle = item.angle;
    var zIndex = item.zIndex;

    return new HayOrNeedle(id, posX, posY, angle, zIndex);
}

/*******
 * IX. Canva utils
 */
function makeCanvas(finishScreen, width, height) {
    // first, make the DOM
    var tempDiv = makeDOM(finishScreen, width, height);

    // regarder les options pour rajouter :
    // - le texte de prise en charge si ça marche pas (voir le DOM d'origine, d'ailleurs)
    // on doit envoyer un élément, pas un objet jQuery
    html2canvas(tempDiv[0], {
        backgroundColor: "transparent",
        imageTimeout: 15000,
        logging: true,// remove for prod
    }).then(function(canvas) {
        $("#mainContainer").prepend(canvas);
        tempDiv.hide();
        rescaleCanvas();
    });
}

function makeDOM(finishScreen, width, height) {
    var dom = '<div id="temp"></div>';
    $("body").prepend(dom);
    var tempDiv = $("#temp");
    tempDiv.css({
        "width": width,
        "height": height
    });

    $.each(finishScreen, function (index, item) {
        if (item !== undefined) {
            if (item.id == "#needle") {
                createNeedleDOM(tempDiv);
                moveTo(item.id, item.y, item.x);
                rotateOf(item.id, item.angle);
            } else {
                // it's a hay
                createHayDOM(tempDiv, item.id);
                moveTo(item.id, item.y, item.x);
                rotateOf(item.id, item.angle);
            }
        }
    });

    return tempDiv;
}

function rescaleCanvas() {
    // calculate rescaling factor (max factor from width and height rescale)
    var heightRatio = mainHeight / fsHeight;
    var widthRatio = mainWidth / fsWidth;
    var ratio = Math.min(heightRatio, widthRatio);

    $("canvas").css({
        "width": ratio * fsWidth,
        "height": ratio * fsHeight
    });
}

function clearScreen() {
    var canvas = $('canvas')[0];
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/********
 * X. Other utils
 */
// to auto-increment z-index when used
// and put the timer always on top
function topZIndex() {
    zIndexOnTop++;

    return zIndexOnTop;
}

// to identify if touch or mouse event and get pageX and pageY from it
function getPageXY(event) {
    var type = event.type;
    var page = { x: 0, y: 0 };
    if (type === "touchstart" || type === "touchend" || type === "touchmove" || type === "touchcancel") {
        page = {
            x: event.changedTouches[0].pageX,
            y: event.changedTouches[0].pageY
        };
    } else {
        page = {
            x: event.pageX,
            y: event.pageY
        };
    }
    return page;
}

// to center a div and put it on top before displaying it but after its filled
function centerDiv(div) {
    div.css({
        "position": "absolute",
        "zIndex": topZIndex()
    });

    // position at centre, remove half width / height of screen
    var leftOffset = Math.round((mainWidth - div.outerWidth()) / 2);
    var bottomOffset = Math.round((mainHeight - div.outerHeight()) / 2);
    
    div.css({
        "bottom": bottomOffset,
        "left": leftOffset
    });
}

// to make you wait
function pleaseWait() {
    var waitScreen = $(".pleaseWait");
    var rAngle = 0;
    centerDiv(waitScreen);

    spinnerTimeout = setInterval(function () {
        waitScreen.find("img").css({
            "-ms-transform": "rotate(" + rAngle + "deg)",
            "-webkit-transform": "rotate(" + rAngle + "deg)",
            "transform": "rotate(" + rAngle + "deg)"
        });
        rAngle += 15;
    }, 100);

    waitScreen.show();
}

// to stop make you wait
function stopWaiting() {
    $(".pleaseWait").hide();
    clearInterval(spinnerTimeout);
}

// fill a string with a number of blanks (for score display)
function fillWithBlanks(string, toSize, where) {
    var missing = toSize - string.length;
    var blanks = "";
    var stringToReturn = "";

    // make a string with the missing blanks
    if (missing > 0) {
        for (i = 0; i < missing; i++) {
            blanks += " ";
        }
    }

    // to put blanks before or after string
    if (where == "before") {
        stringToReturn = blanks + string;
    } else {
        stringToReturn = string + blanks;
    }

    return stringToReturn.substr(0, toSize);
}

// extract parameters from style between two expressions
function extractFromString(string, firstWord, secondWord) {
    // first extract string from the first Word
    var eBegin = string.indexOf(firstWord) + firstWord.length;
    var subString = string.substr(eBegin, string.length);

    // then extract string before the first occurence of ";" or anything else
    var eEnd = subString.indexOf(secondWord);

    // returns the corresponding int (or NaN if not an int)
    // could be useful to check the validity of finish screen
    return parseInt(subString.substr(0, eEnd));
}

// to extract the number in the pathname, which is the id of the finish screen to display
// returns NaN if no number has been extracted
function extractURI(pathname) {
    var eBegin = pathname.indexOf(SITE_BASE_URI) + SITE_BASE_URI.length;
    extracted = pathname.substr(eBegin);
    extracted = extracted.replace(/\//g, '');
    return parseInt(extracted);
}

/****
 * utils to transform to JSON
 */
function finishScreenToJSON(fs) {
    var json = new Array();

    // save mainContainer size
    json.push(mainSizeToJSON());

    // and then the needle and hays
    $.each(fs, function (index, item) {
        json.push(hayOrNeedleToJSON(item));
    });

    return json;
}

function mainSizeToJSON() {
    var mainSizeString = '{"id":"main","mainWidth":"' + mainWidth + '","mainHeight":"' + mainHeight + '"}';
    return JSON.parse(mainSizeString);
}

function hayOrNeedleToJSON(hayOrNeedle) {
    return JSON.parse(JSON.stringify(hayOrNeedle));
}

function disableResizing() {
    var remMainHeight = mainHeight;
    var remMainWidth = mainWidth;
    
    $(window).resize(function() {
        getWindowsSize();
        if (mainHeight == remMainHeight && mainWidth == remMainWidth) {
            $(".antiresize").hide();
            $("#mainContainer").show();
        } else {
            // hide mainContainer
            $("#mainContainer").hide();
            // and show anti-resize div
            $(".antiresize").show();
        }
    });
}

function enableResizing() {
    $(window).off("resize");
}

