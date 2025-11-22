import asyncio
import websockets

async def test():
    uri = "ws://127.0.0.1:8000/generate"
    async with websockets.connect(uri) as ws:
        await ws.send("Generate detailed PPT on AI Agents")

        while True:
            try:
                msg = await ws.recv()
                print("SERVER:", msg)
                if msg == "DONE":
                    break
            except websockets.exceptions.ConnectionClosed:
                break

asyncio.run(test())