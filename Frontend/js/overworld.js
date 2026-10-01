const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const world = {
    width: 3000,
    height: 2000
};

const player = {
    x: 500,
    y: 500,
    width: 40,
    height: 40,
    speed: 300
};

const camera = {
    x: 0,
    y: 0
};

const levels = [
    {
        id: 1,
        x: 800,
        y: 700
    },
    {
        id: 2,
        x: 1600,
        y: 500
    },
    {
        id: 3,
        x: 2300,
        y: 1200
    }
];

const keys = {};


/* -----------------------------
   Tasteneingaben
----------------------------- */

window.addEventListener("keydown", (event) => {
    keys[event.code] = true;

    // Verhindert z. B. das Scrollen mit den Pfeiltasten
    if (
        event.code === "ArrowUp" ||
        event.code === "ArrowDown" ||
        event.code === "ArrowLeft" ||
        event.code === "ArrowRight" ||
        event.code === "Space"
    ) {
        event.preventDefault();
    }
});

window.addEventListener("keyup", (event) => {
    keys[event.code] = false;
});


/* -----------------------------
   Update
----------------------------- */

function update(deltaTime) {

    const movement = player.speed * deltaTime;

    if (keys["KeyW"] || keys["ArrowUp"]) {
        player.y -= movement;
    }

    if (keys["KeyS"] || keys["ArrowDown"]) {
        player.y += movement;
    }

    if (keys["KeyA"] || keys["ArrowLeft"]) {
        player.x -= movement;
    }

    if (keys["KeyD"] || keys["ArrowRight"]) {
        player.x += movement;
    }


    // Spieler innerhalb der Welt halten
    player.x = Math.max(
        0,
        Math.min(player.x, world.width - player.width)
    );

    player.y = Math.max(
        0,
        Math.min(player.y, world.height - player.height)
    );


    // Kamera folgt dem Spieler
    camera.x = player.x - canvas.width / 2 + player.width / 2;
    camera.y = player.y - canvas.height / 2 + player.height / 2;


    // Kamera innerhalb der Welt halten
    camera.x = Math.max(
        0,
        Math.min(camera.x, world.width - canvas.width)
    );

    camera.y = Math.max(
        0,
        Math.min(camera.y, world.height - canvas.height)
    );
}


/* -----------------------------
   Zeichnen
----------------------------- */

function draw() {

    // Bereich außerhalb der Welt
    ctx.fillStyle = "lightblue";
    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    // Welt
    ctx.fillStyle = "green";
    ctx.fillRect(
        -camera.x,
        -camera.y,
        world.width,
        world.height
    );


    // Welt-Grenze
    ctx.strokeStyle = "black";
    ctx.lineWidth = 8;
    ctx.strokeRect(
        -camera.x,
        -camera.y,
        world.width,
        world.height
    );


    // Test-Raster
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 2;

    const gridSize = 100;

    for (let x = 0; x <= world.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - camera.x, -camera.y);
        ctx.lineTo(x - camera.x, world.height - camera.y);
        ctx.stroke();
    }

    for (let y = 0; y <= world.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-camera.x, y - camera.y);
        ctx.lineTo(world.width - camera.x, y - camera.y);
        ctx.stroke();
    }


    // Level-Eingänge
    for (const level of levels) {

        const screenX = level.x - camera.x;
        const screenY = level.y - camera.y;

        // Kreis als Level-Indikator
        ctx.beginPath();
        ctx.arc(
            screenX,
            screenY,
            35,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = "gold";
        ctx.fill();

        ctx.strokeStyle = "black";
        ctx.lineWidth = 4;
        ctx.stroke();


        // Level-Nummer
        ctx.fillStyle = "black";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
            level.id,
            screenX,
            screenY
        );


        // Beschriftung
        ctx.font = "bold 18px Arial";
        ctx.fillText(
            "LEVEL " + level.id,
            screenX,
            screenY - 55
        );
    }


    // Spieler
    ctx.fillStyle = "red";
    ctx.fillRect(
        player.x - camera.x,
        player.y - camera.y,
        player.width,
        player.height
    );
}


/* -----------------------------
   Game Loop
----------------------------- */

let lastTime = 0;

function gameLoop(currentTime) {

    const deltaTime = Math.min(
        (currentTime - lastTime) / 1000,
        0.05
    );

    lastTime = currentTime;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);