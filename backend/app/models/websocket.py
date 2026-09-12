from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints


class Vector3(BaseModel):
    x: float = Field(ge=-100, le=100)
    y: float = Field(ge=-10, le=20)
    z: float = Field(ge=-100, le=100)


class PlayerState(BaseModel):
    id: str
    username: str
    position: Vector3
    rotation: float


class PlayerMovePayload(BaseModel):
    position: Vector3
    rotation: float = Field(ge=-3.142, le=3.142)


class PlayerMoveMessage(BaseModel):
    type: Literal["player.move"]
    payload: PlayerMovePayload


ChatText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class ChatSendPayload(BaseModel):
    text: ChatText


class ChatSendMessage(BaseModel):
    type: Literal["chat.send"]
    payload: ChatSendPayload


class WebSocketTicketResponse(BaseModel):
    ticket: str
    expires_in: int
