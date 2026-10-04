const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const world = {
    width: 120,
    height: 80
};

const player = {
    x: 960,
    y: 640,
    width: 40,
    height: 40,
    speed: 300
};

const camera = {
    x: 0,
    y: 0
};

const tileSize = 16;

const tileset = {
    image: new Image(),

    // grünes Bodentile
    grass: {
        x: 16,
        y: 0
    }
};

tileset.image.src = "assets/Background_Green_TileSet.png";

const map = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
];

const keys = {};

const grassTile = new Image();
grassTile.src = "assets/Background_Green_TileSet.png";


window.addEventListener("keydown", (event) => {
    keys[event.code] = true;

    if (
        event.code === "ArrowUp" ||
        event.code === "ArrowDown" ||
        event.code === "ArrowLeft" ||
        event.code === "ArrowRight"
    ) {
        event.preventDefault();
    }
});

window.addEventListener("keyup", (event) => {
    keys[event.code] = false;
});


function update(deltaTime) {

    const movement = player.speed * deltaTime;

    // Weltgröße in Pixeln
    const worldPixelWidth = world.width * tileSize;
    const worldPixelHeight = world.height * tileSize;


    // Spieler bewegen
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
        Math.min(player.x, worldPixelWidth - player.width)
    );

    player.y = Math.max(
        0,
        Math.min(player.y, worldPixelHeight - player.height)
    );


    // Kamera auf Spieler ausrichten
    camera.x = player.x - canvas.width / 2 + player.width / 2;
    camera.y = player.y - canvas.height / 2 + player.height / 2;


    // Kamera innerhalb der Welt halten
    camera.x = Math.max(
        0,
        Math.min(camera.x, worldPixelWidth - canvas.width)
    );

    camera.y = Math.max(
        0,
        Math.min(camera.y, worldPixelHeight - canvas.height)
    );
}

function draw() {

    ctx.fillStyle = "lightblue";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startX = Math.floor(camera.x / tileSize);
    const startY = Math.floor(camera.y / tileSize);

    const endX = Math.ceil(
        (camera.x + canvas.width) / tileSize
    );

    const endY = Math.ceil(
        (camera.y + canvas.height) / tileSize
    );

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {

            if (
                y < 0 ||
                y >= map.length ||
                x < 0 ||
                x >= map[0].length
            ) {
                continue;
            }

            const tile = map[y][x];

            if (tile === 0) {
                ctx.drawImage(
                    tileset.image,

                    tileset.grass.x,
                    tileset.grass.y,
                    16,
                    16,

                    x * tileSize - camera.x,
                    y * tileSize - camera.y,
                    tileSize,
                    tileSize
                );
            }

            if (tile === 1) {
                ctx.fillStyle = "sandybrown";

                ctx.fillRect(
                    x * tileSize - camera.x,
                    y * tileSize - camera.y,
                    tileSize,
                    tileSize
                );
            }
        }
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