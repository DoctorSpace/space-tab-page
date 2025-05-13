import { MAIN_ITEMS } from "./items.js";

const main = document.getElementById("main");

MAIN_ITEMS.forEach((item) => {
  const div = document.createElement("div");
  div.classList.add("main-block__item");

  div.innerHTML = `
      <a href="${item.link}">
        <img src="${item.img}" alt="${item.name}" />
      </a>
      <p>${item.name}</p>
    `;

  main.appendChild(div);
});
