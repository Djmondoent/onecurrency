// Get references to all the buttons on the page
var homeBtn = document.querySelector(".button.home");
var creditsBtn = document.querySelector(".button.credits");
var settingsBtn = document.querySelector(".button.settings");
var balanceBtn = document.querySelector(".button.balance");
var withdrawBtn = document.querySelector(".button.withdraw");
var depositBtn = document.querySelector(".button.deposit");
var dashboardBtn = document.querySelector(".button.dashboard");

// Add event listeners to each button
homeBtn.addEventListener("click", function () {
  window.location.href = "http://www.example.com/home";
});

creditsBtn.addEventListener("click", function () {
  window.location.href = "http://www.example.com/credits";
});

settingsBtn.addEventListener("click", function () {
  window.location.href = "http://www.example.com/settings";
});

balanceBtn.addEventListener("click", function () {
  alert("Your balance is 0.35480000 BTC");
});

withdrawBtn.addEventListener("click", function () {
  // Add code to show the withdraw modal or perform a withdraw action
});

depositBtn.addEventListener("click", function () {
  // Add code to show the deposit modal or perform a deposit action
});

dashboardBtn.addEventListener("click", function () {
  window.location.href = "http://www.example.com/dashboard";
});
