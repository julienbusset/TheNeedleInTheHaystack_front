/* Script just to load the right title image depending on the language */
var language = window.navigator.userLanguage || window.navigator.language || navigator.browserLanguage || navigator.systemLanguage || "en";

document.write('<img class="title" src="');
if (language.indexOf("fr") >= 0) {
    document.write('images/title_fr.png');
} else {
    document.write('images/title.png');
}
document.write('">');