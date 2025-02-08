create function trigger_set_timestamp() returns trigger
    language plpgsql
as
$$
BEGIN
    NEW.modify_at = NOW();
    RETURN NEW;
END;
$$;

create table "group"
(
    id          serial
        primary key,
    tg_group_id bigint      not null,
    group_name  varchar(64),
    wx_id       varchar(64) not null,
    forward     smallint                 default 1,
    allow_ids   bigint[],
    create_at   timestamp with time zone default now(),
    modify_at   timestamp with time zone default now()
);

create trigger set_timestamp
    before update
    on "group"
    for each row
execute procedure trigger_set_timestamp();

create table message
(
    id         bigserial
        primary key,
    group_id   integer
        references "group",
    from_id    bigint not null,
    content    text,
    is_deleted smallint                 default 0,
    parent_id  bigint,
    create_at  timestamp with time zone default now(),
    modify_at  timestamp with time zone default now()
);

create trigger set_timestamp
    before update
    on message
    for each row
execute procedure trigger_set_timestamp();

create table config
(
    id          serial
        primary key,
    bot_chat_id bigint  not null,
    bot_token   varchar not null,
    login_wxid  varchar not null
        unique,
    setting     json
);

create table wx_contact
(
    wx_id             varchar not null
        references config (login_wxid),
    "userName"        varchar not null,
    "nickName"        varchar,
    "pyInitial"       varchar,
    "quanPin"         varchar,
    sex               integer,
    remark            varchar,
    "remarkPyInitial" varchar,
    "remarkQuanPin"   varchar,
    signature         varchar,
    alias             varchar,
    "snsBgImg"        varchar,
    country           varchar,
    "bigHeadImgUrl"   varchar,
    "smallHeadImgUrl" varchar,
    description       varchar,
    "cardImgUrl"      varchar,
    "labelList"       varchar,
    province          varchar,
    city              varchar,
    "phoneNumList"    varchar,
    id                serial
        constraint wx_contact_pk
            primary key
);

create unique index wx_contact_unique_index
    on wx_contact (wx_id, "userName");

create table wx_room
(
    wx_id             varchar not null
        references config (login_wxid),
    "chatroomId"      varchar not null,
    "nickName"        varchar,
    "pyInitial"       varchar,
    "quanPin"         varchar,
    sex               integer,
    remark            varchar,
    "remarkPyInitial" varchar,
    "remarkQuanPin"   varchar,
    "chatRoomNotify"  integer,
    "chatRoomOwner"   varchar,
    "smallHeadImgUrl" varchar,
    "memberList"      varchar,
    id                serial
        constraint wx_room_pk
            primary key
);

create unique index wx_room_wx_id_room_id_uindex
    on wx_room (wx_id, "chatroomId");



