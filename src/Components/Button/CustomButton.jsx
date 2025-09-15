import React, { Component } from "react";
import { Button, ConfigProvider } from "antd";

const CustomButton = ({text, onclick}) => {
    return (
        <ConfigProvider
            theme={{
                Component: {
                    Button: {
                        ColorPrimary: '#00AA55',
                        algorithm: true,
                    },
                },
            }}
        >
            <Button
                type="primaty"
                onclick={onclick}
                size="large"
            >
                {text}
            </Button>
        </ConfigProvider>
    );
};

